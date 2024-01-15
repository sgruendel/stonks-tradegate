import { expect } from 'chai';

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
            expect(result).to.be.an('array');
            expect(result[1].id).to.be.a('number');
            expect(result[1].price).to.be.a('number');
            expect(result[1].price).to.be.not.NaN;
            expect(result[1].umsatz).to.be.a('number');
            expect(result[1].date).to.be.a('string');
            expect(result[1].time).to.be.a('string');
        });

        it('should work give empty array for id > max', async () => {
            const result = await tradegate.transactions('NL0012969182', 99999999);
            expect(result).to.be.an('array');
            expect(result).to.be.empty;
        });
    });
});
