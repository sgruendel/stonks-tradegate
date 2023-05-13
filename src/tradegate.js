'use strict';

const fetch = require('node-fetch');
const http = require('http');
const https = require('https');
const querystring = require('querystring');
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

const httpAgent = new http.Agent({
    keepAlive: true,
});
const httpsAgent = new https.Agent({
    keepAlive: true,
});
const options = {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36' },
    agent: _parsedURL => {
        return (_parsedURL.protocol === 'http:') ? httpAgent : httpsAgent;
    },
};

const BASE_URL = 'https://www.tradegate.de/';

var exports = module.exports = {};

function normalizeNumber(n) {
    return (typeof n === 'number') ? n : Number(n.replace(',', '.').replace(' ', ''));
}

exports.info = async(isin) => {
    const qs = {
        isin: isin,
    };
    logger.debug('calling ' + querystring.stringify(qs));
    const response = await fetch(BASE_URL + 'refresh.php?' + querystring.stringify(qs), options);
    let info = await response.json();
    info.bid = normalizeNumber(info.bid);
    info.ask = normalizeNumber(info.ask);
    info.delta = normalizeNumber(info.delta);
    info.last = normalizeNumber(info.last);
    info.high = normalizeNumber(info.high);
    info.low = normalizeNumber(info.low);
    return info;
};

exports.transactions = async(isin, id) => {
    const qs = {
        isin: isin,
    };
    if (id) {
        qs.id = id;
    }
    logger.debug('calling ' + querystring.stringify(qs));
    const response = await fetch(BASE_URL + 'umsaetze.php?' + querystring.stringify(qs), options);
    let transactions = [];
    if (response.headers.get('content-length') !== '0') {
        (await response.json()).forEach(t => {
            if (t.date) {
                t.price = normalizeNumber(t.price);
                transactions[t.id] = t;
            }
        });
    }
    return transactions;
};
