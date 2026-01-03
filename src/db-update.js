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

/** @typedef {import('./types.js').Issuer} Issuer */

/** @type {Issuer[]} */
const DAX_ISSUERS = JSON.parse(fs.readFileSync('src/dax.json', 'utf8'));

/** @type {Issuer[]} */
const EUROSTOXX50_ISSUERS = JSON.parse(fs.readFileSync('src/eurostoxx50.json', 'utf8'));

/** @type {Issuer[]} */
const USTOP_ISSUERS = JSON.parse(fs.readFileSync('src/ustop.json', 'utf8'));

/**
 * Update transactions for a given ISIN.  Reads all transactions of today until
 * now from tradegate and updates the database.
 * 
 * @param {string} isin 
 * @returns {Promise<any[]>} 
 */
async function update(isin) {
    logger.debug('updating ' + isin);

    /** @type {Promise<any>[]} */
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
            transactions.forEach((t) => {
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

DAX_ISSUERS.forEach((i) => uniqueIsinsSet.add(i.isin));
EUROSTOXX50_ISSUERS.forEach((i) => uniqueIsinsSet.add(i.isin));
USTOP_ISSUERS.forEach((i) => uniqueIsinsSet.add(i.isin));
const isins = [...uniqueIsinsSet];

logger.info('updating indexes ...');
pMap(isins, update, { concurrency: 4, stopOnError: false }).then(() => {
    logger.info('done, waiting to finish ...');
    db.disconnect();
});
