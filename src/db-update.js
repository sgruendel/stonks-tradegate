import fs from 'fs';
import pMap from 'p-map';
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

import * as db from './db.js';
import * as tradegate from './tradegate.js';

/** @type {Object.<string, string>} */
// @ts-ignore
const dax = JSON.parse(fs.readFileSync('src/dax.json'));

/** @type {Object.<string, string>} */
// @ts-ignore
const eurostoxx50 = JSON.parse(fs.readFileSync('src/eurostoxx50.json'));

/** @type {Object.<string, string>} */
// @ts-ignore
const ustop = JSON.parse(fs.readFileSync('src/ustop.json'));

/**
 * The function `update` retrieves transactions for a given ISIN code from a source called `tradegate`,
 * and updates the database with the retrieved transactions.
 * @param {string} isin - The `isin` parameter is a unique identifier for a financial instrument. It stands for
 * International Securities Identification Number and is used to uniquely identify securities such as
 * stocks, bonds, and options. In the context of the `update` function, it is used to fetch
 * transactions for a specific financial instrument from the
 * @returns The function `update` returns a promise that resolves to an array of results from updating
 * transactions in the database.
 */
async function update(isin) {
    logger.debug('updating ' + isin);

    /** @type {Promise[]} */
    let allPromises = [];

    /** @type {number} */
    let lastId;

    let retry = 0;
    while (true) {
        try {
            const transactions = await tradegate.transactions(isin, lastId);
            if (retry > 0) {
                logger.info('retry ' + retry + ': successful for ' + isin);
                retry = 0;
            }
            if (transactions.length === 0) {
                break;
            }
            transactions.map((t) => {
                allPromises.push(
                    db.Transactions.updateOne({ isin: isin, date: t.date, id: t.id }, t, { upsert: true }),
                );
                lastId = t.id;
            });
        } catch (err) {
            logger.error('try ' + ++retry + ': error getting transactions for ' + isin, err);
            await new Promise((resolve) => setTimeout(resolve, 3000));
        }
    }

    logger.debug('all promises ' + isin + ': ' + allPromises.length);
    return Promise.all(allPromises);
}

/** @type Set<string> */
const uniqueIsinsSet = new Set();

Object.keys(dax).forEach(isin => uniqueIsinsSet.add(isin));
Object.keys(eurostoxx50).forEach(isin => uniqueIsinsSet.add(isin));
Object.keys(ustop).forEach(isin => uniqueIsinsSet.add(isin));
const isins = [...uniqueIsinsSet];

logger.info('updating indexes ...');
pMap(isins, update, { concurrency: 5, stopOnError: false }).then(() => {
    logger.info('done, waiting to finish ...');
    db.disconnect();
});
