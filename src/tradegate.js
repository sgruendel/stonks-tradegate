import fetch from 'node-fetch';
import http from 'http';
import https from 'https';
import querystring from 'querystring';
import winston from 'winston';

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    transports: [
        new winston.transports.Console({
            format: winston.format.simple(),
        }),
    ],
    exitOnError: false,
});

const httpAgent = new http.Agent({
    keepAlive: true,
});
const httpsAgent = new https.Agent({
    keepAlive: true,
});
const options = {
    headers: {
        'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    agent: (_parsedURL) => {
        return _parsedURL.protocol === 'http:' ? httpAgent : httpsAgent;
    },
};

const BASE_URL = 'https://www.tradegate.de/';

/**
 * direct JSON response from tradegate.de/refresh.php for an ISIN
 *
 * @typedef TradegateInfoJson
 * @type {object}
 * @property {number|string} bid
 * @property {number|string} ask
 * @property {number} bidsize
 * @property {number} asksize
 * @property {number|string} delta
 * @property {number} stueck
 * @property {number} umsatz
 * @property {number|string} avg
 * @property {number} executions
 * @property {number|string} last
 * @property {number|string} high
 * @property {number|string} low
 * @property {number|string} close
 */

/**
 * normalized response from tradegate.de/refresh.php for an ISIN
 *
 * @typedef TradegateInfo
 * @type {object}
 * @property {number} bid
 * @property {number} ask
 * @property {number} bidsize
 * @property {number} asksize
 * @property {number} delta
 * @property {number} stueck
 * @property {number} umsatz
 * @property {number} avg
 * @property {number} executions
 * @property {number} last
 * @property {number} high
 * @property {number} low
 * @property {number} close
 */

/**
 * direct JSON response from tradegate.de/umsaetze.php for an ISIN
 *
 * @typedef TradegateTransactionJson
 * @type {object}
 * @property {number} id
 * @property {number|string} [price]
 * @property {number} [volume]
 * @property {number} [umsatz]
 * @property {string} [date]
 * @property {string} [time]
 */

/**
 * normalized response from tradegate.de/umsaetze.php for an ISIN
 *
 * @typedef TradegateTransaction
 * @type {object}
 * @property {number} id
 * @property {number} price
 * @property {number} umsatz
 * @property {string} date
 * @property {string} time
 */

/**
 * Normalizes numeric JSON data to a Number object.  Converts a String by replacing commas with periods and removing spaces first.
 * @param {number|string} n JSON data to normalize
 * @returns normalized number
 */
function normalizeNumber(n) {
    return typeof n === 'number' ? n : Number(n.replace(',', '.').replace(' ', ''));
}

/**
 * Gets information about a financial instrument using its ISIN.
 * @param {string} isin International Securities Identification Number (ISIN) to get info for
 * @returns info for ISIN
 */
export async function info(isin) {
    const qs = {
        isin: isin,
    };
    logger.debug('calling ' + querystring.stringify(qs));
    const response = await fetch(BASE_URL + 'refresh.php?' + querystring.stringify(qs), options);

    /** @type {TradegateInfoJson} */
    // @ts-ignore
    const infoJson = await response.json();

    /** @type {TradegateInfo} */
    const info = {
        bid: normalizeNumber(infoJson.bid),
        ask: normalizeNumber(infoJson.ask),
        bidsize: infoJson.bidsize,
        asksize: infoJson.asksize,
        delta: normalizeNumber(infoJson.delta),
        stueck: infoJson.stueck,
        umsatz: infoJson.umsatz,
        avg: normalizeNumber(infoJson.avg),
        executions: infoJson.executions,
        last: normalizeNumber(infoJson.last),
        high: normalizeNumber(infoJson.high),
        low: normalizeNumber(infoJson.low),
        close: normalizeNumber(infoJson.close),
    };
    return info;
}

/**
 * Gets transaction data for the provided ISIN, starting at optional transaction ID.
 * @param {string} isin International Securities Identification Number (ISIN) to get transactions for
 * @param {number} [id] optional transaction ID to start at
 * @returns {Promise<TradegateTransaction[]>} an array of transactions
 */
export async function transactions(isin, id) {
    const qs = {
        isin: isin,
    };
    if (id) {
        qs.id = id;
    }
    logger.debug('calling ' + querystring.stringify(qs));
    const response = await fetch(BASE_URL + 'umsaetze.php?' + querystring.stringify(qs), options);

    /** @type {TradegateTransaction[]} */
    let transactions = [];
    if (response.headers.get('content-length') !== '0') {
        /** @type {TradegateTransactionJson[]} */
        // @ts-ignore
        const transactionsJson = await response.json();
        transactionsJson.forEach((t) => {
            if (t.date) {
                const transaction = {
                    id: t.id,
                    price: normalizeNumber(t.price),
                    umsatz: t.umsatz,
                    date: t.date,
                    time: t.time,
                };
                transactions[t.id] = transaction;
            }
        });
    }
    return transactions;
}
