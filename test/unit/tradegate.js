import { expect } from 'chai';
import { describe, it } from 'mocha';

import * as tradegate from '../../src/tradegate.js';

describe('tradegate', () => {
    describe('#info()', () => {
        it('should work for MBG', async () => {
            const result = await tradegate.info('DE0007100000');
            expect(result.bid).to.be.a('number');
            expect(result.ask).to.be.a('number');
            expect(result.bidsize).to.be.a('number');
            expect(result.asksize).to.be.a('number');
            expect(result.delta).to.be.a('number');
            expect(result.stueck).to.be.a('number');
            expect(result.umsatz).to.be.a('number');
            expect(result.avg).to.be.a('number');
            expect(result.executions).to.be.a('number');
            expect(result.last).to.be.a('number');
            expect(result.high).to.be.a('number');
            expect(result.low).to.be.a('number');
            expect(result.close).to.be.a('number');
        });
    });

    describe('#transactions()', () => {
        it('should work for Adyen', async () => {
            const result = await tradegate.transactions('NL0012969182');
            const firstId = Object.keys(result)[0];
            expect(result).to.be.an('array');
            expect(result[firstId].id).to.be.a('number');
            expect(result[firstId].price).to.be.a('number').and.not.NaN;
            expect(result[firstId].umsatz).to.be.a('number');
            expect(result[firstId].date).to.be.a('string');
            expect(result[firstId].time).to.be.a('string');
        });

        it('should give empty array for id > max', async () => {
            const result = await tradegate.transactions('NL0012969182', 99999999);
            expect(result).to.be.an('array');
            expect(result).to.be.empty;
        });
    });
});
