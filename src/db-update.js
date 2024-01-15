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

const dax = JSON.parse(fs.readFileSync('src/dax.json'));
const eurostoxx50 = JSON.parse(fs.readFileSync('src/eurostoxx50.json'));
const ustop = JSON.parse(fs.readFileSync('src/ustop.json'));

async function update(isin) {
    let allPromises = [];
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

async function updateAll(isins) {
    let allPromises = [];
    for (const isin in isins) {
        allPromises.push(update(isin));
    }

    return Promise.all(allPromises);
}

const indexes = [dax, eurostoxx50, ustop];

logger.info('updating indexes ...');
pMap(indexes, updateAll, { concurrency: 1, stopOnError: false }).then(() => {
    logger.info('done, waiting to finish ...');
    db.disconnect();
});
