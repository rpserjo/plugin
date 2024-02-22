(function () {
    'use strict';

    console.log('FakePremium', 'started');
    Lampa.Account.hasPremium = () => {
        return true
    }
})();