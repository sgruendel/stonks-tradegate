import moment from 'moment';
import { EMA, RSI } from 'trading-signals';

import { Transactions, disconnect } from './db.js';

const DATE_FORMAT = 'YYYY-MM-DD';
const TRANSACTION_DATE_TIME_FORMAT = '%Y-%m-%d %H:%M:%S.%L';

/**
 * @typedef {object} Candle Trading candle
 * @property {Date} time Trading candle time
 * @property {number} open Trading candle open price
 * @property {number} high Trading candle high price
 * @property {number} low Trading candle low price
 * @property {number} close Trading candle close price
 * @property {number} volume Trading candle volume
 */

/**
 * @typedef {object} BacktestResult Trading backtest result
 * @property {number} trades Number of executed trades
 * @property {number} wins Number of winning trades
 * @property {number} losses Number of losing trades
 * @property {number} pnl Total profit and loss
 */

/**
 * @typedef {'buy'|'sell'|null} Signal Trading signal
 */

/**
 * @callback SignalFn function returning trading signal for given candle
 * @param {Candle} candle
 * @returns {Signal}
 */

/**
 * @typedef {object} CandleDoc
 * @property {Date} _id
 * @property {number} open
 * @property {number} high
 * @property {number} low
 * @property {number} close
 * @property {number} volume
 */

/**
 * Print usage information.
 * @returns {void}
 */
const usage = () => {
    console.log('Usage: node src/backtest-cli.js --isin <ISIN[,ISIN]> --from YYYY-MM-DD --to YYYY-MM-DD');
    console.log('       --intervals 5,15,60 --strategy ema-cross|rsi-reversion');
};

/**
 * Get a command line argument value by name.
 * @param {string} name
 * @param {string|undefined} [fallback]
 * @returns {string|undefined}
 */
const getArgValue = (name, fallback) => {
    const args = process.argv.slice(2);
    const index = args.findIndex((arg) => arg === `--${name}`);
    if (index === -1 || index + 1 >= args.length) {
        return fallback;
    }
    return args[index + 1];
};

/**
 * Parse a comma separated ISIN list into an array.
 * @param {string} value
 * @returns {string[]}
 */
const parseIsins = (value) => {
    if (!value) {
        return [];
    }
    return value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
};

/**
 * Parse comma separated intervals into an array of positive numbers.
 * @param {string} value
 * @returns {number[]}
 */
const parseIntervals = (value) => {
    return value
        .split(',')
        .map((entry) => Number(entry))
        .filter((entry) => Number.isFinite(entry) && entry > 0);
};

/**
 * @param {string} isin
 * @param {string} fromDate
 * @param {string} toDate
 * @param {number} intervalMinutes
 * @returns {object[]}
 */
const candlePipeline = (isin, fromDate, toDate, intervalMinutes) => {
    const intervalMs = intervalMinutes * 60 * 1000;
    return [
        { $match: { isin, date: { $gte: fromDate, $lte: toDate } } },
        {
            $addFields: {
                datetime: {
                    $dateFromString: {
                        dateString: { $concat: ['$date', ' ', '$time'] },
                        format: TRANSACTION_DATE_TIME_FORMAT,
                    },
                },
            },
        },
        { $sort: { datetime: 1 } },
        {
            $addFields: {
                bucket: {
                    $toDate: {
                        $subtract: [{ $toLong: '$datetime' }, { $mod: [{ $toLong: '$datetime' }, intervalMs] }],
                    },
                },
            },
        },
        {
            $group: {
                _id: '$bucket',
                open: { $first: '$price' },
                high: { $max: '$price' },
                low: { $min: '$price' },
                close: { $last: '$price' },
                volume: { $sum: '$umsatz' },
            },
        },
        { $sort: { _id: 1 } },
    ];
};

/**
 * Run a simple long-only backtest over provided candles.
 * @param {Candle[]} candles
 * @param {SignalFn} signalFn
 * @returns {BacktestResult}
 */
const runBacktest = (candles, signalFn) => {
    /** @type {number|null} */
    let position = null;
    let trades = 0;
    let wins = 0;
    let losses = 0;
    let pnl = 0;

    // Iterate over all candles
    candles.forEach((candle) => {
        const signal = signalFn(candle);
        console.log(
            `Candle ${candle.time.toISOString()} (${candle.open}, ${candle.high}, ${candle.low}, ${candle.close}, ${candle.volume}): signal=${signal}, position=${position}`,
        );
        if (signal === 'buy' && position === null) {
            position = candle.close;
            trades += 1;
            console.log(`  Entered position at ${position}`);
            return;
        }
        if (signal === 'sell' && position !== null) {
            const tradePnL = candle.close - position;
            pnl += tradePnL;
            if (tradePnL >= 0) {
                wins += 1;
                console.log(`  Exited position at ${candle.close} with profit ${tradePnL}`);
            } else {
                console.log(`  Exited position at ${candle.close} with loss ${tradePnL}`);
                losses += 1;
            }
            position = null;
        }
    });

    // Close any open position at last candle close price
    if (position !== null && candles.length > 0) {
        const tradePnL = candles[candles.length - 1].close - position;
        pnl += tradePnL;
        if (tradePnL >= 0) {
            wins += 1;
        } else {
            losses += 1;
        }
    }

    return { trades, wins, losses, pnl };
};

/**
 * Create EMA cross strategy.
 * @returns {SignalFn}
 */
const makeEmaCrossStrategy = () => {
    const fast = new EMA(12);
    const slow = new EMA(26);
    /** @type {number|null} */
    let previousDiff = null;

    // @param {Candle} candle
    return (candle) => {
        fast.update(candle.close, false);
        slow.update(candle.close, false);

        if (!fast.isStable || !slow.isStable) {
            return null;
        }

        const diff = fast.getResult() - slow.getResult();
        const signal =
            previousDiff === null
                ? null
                : diff > 0 && previousDiff <= 0
                  ? 'buy'
                  : diff < 0 && previousDiff >= 0
                    ? 'sell'
                    : null;
        previousDiff = diff;
        return signal;
    };
};

/**
 * Create RSI reversion strategy.
 * @returns {SignalFn}
 */
const makeRsiReversionStrategy = () => {
    const rsi = new RSI(14);

    // @param {Candle} candle
    return (candle) => {
        rsi.update(candle.close, false);
        if (!rsi.isStable) {
            return null;
        }
        const value = rsi.getResult();
        if (value < 30) {
            return 'buy';
        }
        if (value > 70) {
            return 'sell';
        }
        return null;
    };
};

/** @type {Record<string, () => SignalFn>} */
const strategies = {
    'ema-cross': makeEmaCrossStrategy,
    'rsi-reversion': makeRsiReversionStrategy,
};

const main = async () => {
    const isins = parseIsins(getArgValue('isin', ''));
    const fromDate = getArgValue('from', moment().subtract(2, 'years').format(DATE_FORMAT));
    const toDate = getArgValue('to', moment().format(DATE_FORMAT));
    const intervals = parseIntervals(getArgValue('intervals', '5,15,60'));
    const strategyName = getArgValue('strategy', 'ema-cross');

    if (isins.length === 0) {
        usage();
        throw new Error('Missing --isin');
    }

    if (!moment(fromDate, DATE_FORMAT, true).isValid() || !moment(toDate, DATE_FORMAT, true).isValid()) {
        usage();
        throw new Error('Invalid --from or --to date');
    }

    if (intervals.length === 0) {
        usage();
        throw new Error('No valid --intervals provided');
    }

    const strategyFactory = strategies[strategyName];
    if (!strategyFactory) {
        usage();
        throw new Error(`Unknown strategy: ${strategyName}`);
    }

    for (const isin of isins) {
        for (const interval of intervals) {
            const pipeline = candlePipeline(isin, fromDate, toDate, interval);
            /** @type {Candle[]} */
            const candles = (await Transactions.aggregate(pipeline)).map((candle) => ({
                time: candle._id,
                open: candle.open,
                high: candle.high,
                low: candle.low,
                close: candle.close,
                volume: candle.volume,
            }));

            const result = runBacktest(candles, strategyFactory());
            console.log({ isin, interval, strategy: strategyName, from: fromDate, to: toDate, result });
        }
    }
};

main()
    .catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    })
    .finally(() => disconnect());
