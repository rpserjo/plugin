const TARGET_PATTERN = /example\.com\/api\//; // маска для фильтрации

let attachedTabId = null;

chrome.action.onClicked.addListener(async (tab) => {
    if (!attachedTabId) {
        try {
            // Подключаемся к вкладке через DevTools Protocol
            await chrome.debugger.attach({ tabId: tab.id }, "1.3");
            attachedTabId = tab.id;

            // Включаем сетевой домен
            await chrome.debugger.sendCommand({ tabId: tab.id }, "Network.enable");

            // Подписка на события
            chrome.debugger.onEvent.addListener((source, method, params) => {
                if (source.tabId !== attachedTabId) return;

                // При получении ответа проверяем URL
                if (method === "Network.responseReceived") {
                    const url = params.response.url;
                    console.log(url)
                    // if (TARGET_PATTERN.test(url)) {
                        // Получаем тело ответа
                        chrome.debugger.sendCommand(
                            { tabId: attachedTabId },
                            "Network.getResponseBody",
                            { requestId: params.requestId },
                            (body) => {
                                if (chrome.runtime.lastError) {
                                    console.error(chrome.runtime.lastError.message);
                                    return;
                                }
                                saveBody(url, body);
                            }
                        );
                    // }
                }
            });

            console.log("✅ Подключено к вкладке для перехвата");
        } catch (err) {
            console.error("Attach error:", err);
        }
    } else {
        // Отключаемся
        await chrome.debugger.detach({ tabId: attachedTabId });
        attachedTabId = null;
        console.log("⏹ Перехват остановлен");
    }
});

function saveBody(url, bodyObj) {
    console.log('try to save', url, bodyObj)
    const { body, base64Encoded } = bodyObj;
    const safeName = url.replace(/[^a-z0-9]/gi, "_").slice(0, 100);
    const filename = `${safeName}_${Date.now()}.bin`;

    let dataUrl;

    if (base64Encoded) {
        // Тело уже закодировано в base64
        dataUrl = `data:application/octet-stream;base64,${body}`;
    } else {
        // Кодируем текст в base64 вручную
        const base64 = btoa(unescape(encodeURIComponent(body)));
        dataUrl = `data:text/plain;base64,${base64}`;
    }

    chrome.downloads.download({
        url: dataUrl,
        filename
    });
}
