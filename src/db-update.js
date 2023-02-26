'use strict';

const pMap = require('p-map');
const winston = require('winston');

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    transports: [
        new winston.transports.Console({
            format: winston.format.simple(),
        }),
    ],
    exitOnError: false,
});

const db = require('./db');
const tradegate = require('./tradegate');

const dax = require('./dax.json');
const eurostoxx50 = require('./eurostoxx50.json');
const ustop = require('./ustop.json');

async function update(isin) {
    let allPromises = [];
    let lastId;
    while (true) {
        try {
            const transactions = await tradegate.transactions(isin, lastId);
            if (transactions.length === 0) {
                break;
            }
            transactions.map(t => {
                allPromises.push(
                    db.Transactions.updateOne({ isin: isin, date: t.date, id: t.id }, t, { upsert: true }));
                lastId = t.id;
            });
        } catch (err) {
            logger.error('error getting transactions for ' + isin, err);
            await new Promise(resolve => setTimeout(resolve, 300));
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

const indexes = [ dax, eurostoxx50, ustop ];

logger.info('updating indexes ...');
pMap(indexes, updateAll, { concurrency: 1, stopOnError: false }).then(() => {
    logger.info('done, waiting to finish ...');
    db.disconnect();
});
