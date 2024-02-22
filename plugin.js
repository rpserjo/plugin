(function () {
    'use strict';

    var premium_plugin = {
        name: 'Premium plugin',
        version: '0.0.1',
        description: 'Fake premium'
    };

    Lampa.Settings.listener.follow('open', function (e) {
        console.log('FakePremium', e)
        if (e.name == 'fake_prem') {
            e.body.find('[data-parent="proxy"]').remove();
        }
    });

    console.log('FakePremium', 'started, enabled:', Lampa.Storage.field('fake_premium'));
    console.log(Lampa)
})();