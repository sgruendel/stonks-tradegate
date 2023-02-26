'use strict';

const mongoose = require('mongoose');
mongoose.set('strictQuery', false);
mongoose.connect('mongodb://localhost:27017/stonks-tradegate');

var exports = module.exports = {};

exports.disconnect = mongoose.disconnect;

const transactions = new mongoose.Schema({
    isin: {
        type: String,
        required: true,
        minLength: 8,
    },
    date: {
        type: String,
        required: true,
        match: /^\d{4}-\d{2}-\d{2}$/,
    },
    time: {
        type: String,
        required: true,
        match: /^\d{2}:\d{2}:\d{2}.\d{3}$/,
    },
    id: {
        type: Number,
        required: true,
        min: 1,
    },
    price: {
        type: Number,
        required: true,
        min: 0,
    },
    umsatz: {
        type: Number,
        required: true,
        min: 0,
    },
}, {
    autoCreate: true,
    timestamps: true,
});
transactions.index({ isin: 1, date: -1, time: 1 });
transactions.index({ isin: 1, date: -1, id: -1 });
exports.Transactions = mongoose.model('Transactions', transactions);
