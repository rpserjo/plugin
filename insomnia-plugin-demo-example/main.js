const requestHook = async (context) => {
    const test = await context.request.getEnvironmentVariable('test3');
    console.log('Test', test);
    console.log('Request', context.request);
    const { execSync } = require('child_process');
    const command = 'dir';
    try {
        const result = execSync(command, { encoding: 'utf-8' });
        console.log('Result', result)
    } catch (e) {
        await showModal(context, 'Error', e);
    }
    context.request.setUrl('https://github.com');
    const fs = require('fs');
    const testData = fs.readFileSync('D://test.txt');
    try {
        let int = parseInt(testData);
        console.log('Int', int)
        if (!isNaN(int)) {
            int++;
        }else{
            int = 0;
        }
        fs.writeFileSync('D://test.txt', int.toString());
    } catch (e) {
        await showModal(context, 'Error', e);
    }
}

const requestAction = {
    label: 'Request action',
    icon: 'fa-trash',
    action: async (context) => {
        console.log(context)
        await showModal (context, 'My modal', 'Modal <b>Content</b>')
    }
}

const showModal = async (context, title, content) => {
    const div = document.createElement('div');
    div.innerHTML = content;
    context.app.dialog(title, div, {tall: true});
}

exports.requestActions = [requestAction];
exports.requestHooks = [requestHook];
