// (function () {
//     // --- Start: Configuration ---
//     let options = {
//         mocks: [], // { pattern: "string", response: "json_string" }
//         redactions: [] // { key: "string" }
//     };

//     // Listen for options from the content-script bridge
//     window.addEventListener('message', (event) => {
//         if (event.source === window && event.data.type === 'SET_OPTIONS') {
//             options = event.data.payload || { mocks: [], redactions: [] };
//         }
//     });
//     // --- End: Configuration ---


//     // --- Start: Utility Functions ---
//     const sendLog = (payload) => {
//         window.postMessage({ type: 'API_CALL_LOG', payload }, '*');
//     };

//     const safeJsonParse = (text) => {
//         try {
//             return JSON.parse(text);
//         } catch (e) {
//             return text;
//         }
//     };

//     const getRequestBody = async (request) => {
//         if (request.method === 'GET' || request.method === 'HEAD') {
//             return null;
//         }
//         try {
//             const clonedReq = request.clone();
//             return await clonedReq.text();
//         } catch (e) {
//             return `[Could not read body: ${e.message}]`;
//         }
//     };

//     const getResponseBody = async (response) => {
//         try {
//             const clonedRes = response.clone();
//             const text = await clonedRes.text();
//             return text;
//         } catch (e) {
//             return `[Could not read body: ${e.message}]`;
//         }
//     };

//     const redact = (headers, body) => {
//         const redactedHeaders = { ...headers };
//         let redactedBody = body;
//         const redactionKeys = (options.redactions || []).map(r => r.key.toLowerCase());

//         if (!redactionKeys.length) {
//             return { headers: redactedHeaders, body: redactedBody };
//         }

//         // Redact Headers
//         for (const key of Object.keys(redactedHeaders)) {
//             if (redactionKeys.includes(key.toLowerCase())) {
//                 redactedHeaders[key] = '[REDACTED]';
//             }
//         }

//         // Redact Body (simple JSON key redaction)
//         try {
//             const bodyObj = JSON.parse(body);
//             // This is a simple implementation. A real one would walk the object.
//             for (const key of Object.keys(bodyObj)) {
//                 if (redactionKeys.includes(key.toLowerCase())) {
//                     bodyObj[key] = '[REDACTED]';
//                 }
//             }
//             redactedBody = JSON.stringify(bodyObj);
//         } catch (e) {
//             // Not JSON, or complex redaction not supported in this MVP
//         }

//         return { headers: redactedHeaders, body: redactedBody };
//     };

//     const checkMocks = (url) => {
//         for (const mock of (options.mocks || [])) {
//             if (url.includes(mock.pattern)) {
//                 // console.log(`API Tracker: Mocking URL ${url}`);
//                 try {
//                     const body = mock.response;
//                     const res = new Response(body, {
//                         status: 200,
//                         statusText: 'OK (Mocked)',
//                         headers: { 'Content-Type': 'application/json' }
//                     });
//                     return {
//                         mocked: true,
//                         response: res,
//                         body: body
//                     };
//                 } catch (e) {
//                     console.error("API Tracker: Mock response error", e);
//                 }
//             }
//         }
//         return { mocked: false };
//     };
//     // --- End: Utility Functions ---


//     // --- Start: Fetch Interceptor ---
//     const originalFetch = window.fetch;
//     window.fetch = async function (input, init) {
//         const start = performance.now();
//         const id = `fetch_${Date.now()}_${Math.random()}`;
//         const url = (input instanceof Request) ? input.url : input;
//         const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();

//         // 1. Check for mocks
//         const mock = checkMocks(url);
//         if (mock.mocked) {
//             const end = performance.now();
//             const log = {
//                 id,
//                 url,
//                 method,
//                 status: 200,
//                 statusText: 'OK (Mocked)',
//                 startTime: start,
//                 endTime: end,
//                 duration: end - start,
//                 request: {
//                     headers: init?.headers || {},
//                     body: await getRequestBody(new Request(input, init))
//                 },
//                 response: {
//                     headers: { 'Content-Type': 'application/json' },
//                     body: mock.body,
//                     size: mock.body.length
//                 },
//                 type: 'Fetch',
//                 mocked: true
//             };

//             // Don't redact mocks
//             sendLog(log);
//             return mock.response;
//         }

//         // 2. Not mocked, proceed with real request
//         let response;
//         let error = null;

//         const reqHeaders = {};
//         if (init?.headers) {
//             if (init.headers instanceof Headers) {
//                 init.headers.forEach((val, key) => reqHeaders[key] = val);
//             } else {
//                 Object.assign(reqHeaders, init.headers);
//             }
//         }
//         const reqBody = await getRequestBody(new Request(input, init));
//         const { headers: redactedReqHeaders, body: redactedReqBody } = redact(reqHeaders, reqBody);

//         try {
//             response = await originalFetch(input, init);
//         } catch (e) {
//             error = e;
//         }

//         const end = performance.now();
//         const resHeaders = {};
//         response?.headers.forEach((val, key) => resHeaders[key] = val);

//         const resBody = error ? null : await getResponseBody(response);
//         const { headers: redactedResHeaders, body: redactedResBody } = redact(resHeaders, resBody);

//         const log = {
//             id,
//             url,
//             method,
//             status: error ? 0 : response.status,
//             statusText: error ? error.message : response.statusText,
//             startTime: start,
//             endTime: end,
//             duration: end - start,
//             request: {
//                 headers: redactedReqHeaders,
//                 body: safeJsonParse(redactedReqBody)
//             },
//             response: {
//                 headers: redactedResHeaders,
//                 body: safeJsonParse(redactedResBody),
//                 size: resBody?.length || 0
//             },
//             type: 'Fetch',
//             mocked: false,
//             error: !!error
//         };

//         sendLog(log);

//         if (error) {
//             throw error;
//         }

//         return response;
//     };
//     // --- End: Fetch Interceptor ---


//     // --- Start: XHR Interceptor ---
//     const originalXhrOpen = XMLHttpRequest.prototype.open;
//     const originalXhrSend = XMLHttpRequest.prototype.send;

//     XMLHttpRequest.prototype.open = function (method, url) {
//         this._apiTrackerInfo = {
//             method: method.toUpperCase(),
//             url: url,
//             id: `xhr_${Date.now()}_${Math.random()}`
//         };
//         originalXhrOpen.apply(this, arguments);
//     };

//     XMLHttpRequest.prototype.send = function (body) {
//         const info = this._apiTrackerInfo;
//         const start = performance.now();

//         // TODO: Add XHR Mocks (more complex, skipping for this MVP)

//         this.addEventListener('loadend', () => {
//             const end = performance.now();

//             const reqHeaders = {}; // Note: Getting XHR request headers is hard.
//             const { headers: redactedReqHeaders, body: redactedReqBody } = redact(reqHeaders, body);

//             const resHeaders = {};
//             this.getAllResponseHeaders().trim().split(/[\r\n]+/).forEach(line => {
//                 const parts = line.split(': ');
//                 resHeaders[parts.shift()] = parts.join(': ');
//             });
//             const { headers: redactedResHeaders, body: redactedResBody } = redact(resHeaders, this.responseText);

//             const log = {
//                 id: info.id,
//                 url: info.url,
//                 method: info.method,
//                 status: this.status,
//                 statusText: this.statusText,
//                 startTime: start,
//                 endTime: end,
//                 duration: end - start,
//                 request: {
//                     headers: redactedReqHeaders,
//                     body: safeJsonParse(redactedReqBody)
//                 },
//                 response: {
//                     headers: redactedResHeaders,
//                     body: safeJsonParse(redactedResBody),
//                     size: this.responseText.length
//                 },
//                 type: 'XHR',
//                 mocked: false,
//                 error: this.status < 200 || this.status >= 400
//             };
//             sendLog(log);
//         });

//         originalXhrSend.apply(this, arguments);
//     };
//     // --- End: XHR Interceptor ---

// })();


(function () {
    // --- Start: Configuration ---
    let options = {
        mocks: [], // { pattern: "string", response: "json_string" }
        redactions: [] // { key: "string" }
    };

    // Listen for options from the content-script bridge
    window.addEventListener('message', (event) => {
        if (event.source === window && event.data.type === 'SET_OPTIONS') {
            options = event.data.payload || { mocks: [], redactions: [] };
            // console.log('API Tracker: Options updated', options);
        }
    });
    // --- End: Configuration ---


    // --- Start: Utility Functions ---
    const sendLog = (payload) => {
        // This is where the error happens if payload contains non-cloneable objects
        window.postMessage({ type: 'API_CALL_LOG', payload }, '*');
    };

    const safeJsonParse = (text) => {
        try {
            return JSON.parse(text);
        } catch (e) {
            return text;
        }
    };

    const getRequestBody = async (request) => {
        if (request.method === 'GET' || request.method === 'HEAD') {
            return null;
        }
        try {
            const clonedReq = request.clone();
            return await clonedReq.text();
        } catch (e) {
            return `[Could not read body: ${e.message}]`;
        }
    };

    const getResponseBody = async (response) => {
        try {
            const clonedRes = response.clone();
            const text = await clonedRes.text();
            return text;
        } catch (e) {
            return `[Could not read body: ${e.message}]`;
        }
    };

    const redact = (headers, body) => {
        const redactedHeaders = { ...headers };
        let redactedBody = body;
        const redactionKeys = (options.redactions || []).map(r => r.key.toLowerCase());

        if (!redactionKeys.length) {
            return { headers: redactedHeaders, body: redactedBody };
        }

        // Redact Headers
        for (const key of Object.keys(redactedHeaders)) {
            if (redactionKeys.includes(key.toLowerCase())) {
                redactedHeaders[key] = '[REDACTED]';
            }
        }

        // Redact Body (simple JSON key redaction)
        try {
            const bodyObj = JSON.parse(body);
            // This is a simple implementation. A real one would walk the object.
            for (const key of Object.keys(bodyObj)) {
                if (redactionKeys.includes(key.toLowerCase())) {
                    bodyObj[key] = '[REDACTED]';
                }
            }
            redactedBody = JSON.stringify(bodyObj);
        } catch (e) {
            // Not JSON, or complex redaction not supported in this MVP
        }

        return { headers: redactedHeaders, body: redactedBody };
    };

    const checkMocks = (url) => {
        for (const mock of (options.mocks || [])) {
            if (url.includes(mock.pattern)) {
                console.log(`API Tracker: Mocking URL ${url}`);
                try {
                    const body = mock.response;
                    const res = new Response(body, {
                        status: 200,
                        statusText: 'OK (Mocked)',
                        headers: { 'Content-Type': 'application/json' }
                    });
                    return {
                        mocked: true,
                        response: res,
                        body: body
                    };
                } catch (e) {
                    console.error("API Tracker: Mock response error", e);
                }
            }
        }
        return { mocked: false };
    };
    // --- End: Utility Functions ---


    // --- Start: Fetch Interceptor ---
    const originalFetch = window.fetch;
    window.fetch = async function (input, init) {
        const start = performance.now();
        const id = `fetch_${Date.now()}_${Math.random()}`;

        // FIX: Ensure URL is a string, not a URL object
        const urlString = (input instanceof Request) ? input.url : String(input);

        const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();

        // 1. Check for mocks
        const mock = checkMocks(urlString);
        if (mock.mocked) {
            const end = performance.now();
            const log = {
                id,
                url: urlString, // Use the string version
                method,
                status: 200,
                statusText: 'OK (Mocked)',
                startTime: start,
                endTime: end,
                duration: end - start,
                request: {
                    headers: init?.headers || {},
                    body: await getRequestBody(new Request(input, init))
                },
                response: {
                    headers: { 'Content-Type': 'application/json' },
                    body: mock.body,
                    size: mock.body.length
                },
                type: 'Fetch',
                mocked: true
            };

            // Don't redact mocks
            sendLog(log);
            return mock.response;
        }

        // 2. Not mocked, proceed with real request
        let response;
        let error = null;

        const reqHeaders = {};
        if (init?.headers) {
            if (init.headers instanceof Headers) {
                init.headers.forEach((val, key) => reqHeaders[key] = val);
            } else {
                Object.assign(reqHeaders, init.headers);
            }
        }
        const reqBody = await getRequestBody(new Request(input, init));
        const { headers: redactedReqHeaders, body: redactedReqBody } = redact(reqHeaders, reqBody);

        try {
            response = await originalFetch(input, init);
        } catch (e) {
            error = e;
        }

        const end = performance.now();
        const resHeaders = {};
        response?.headers.forEach((val, key) => resHeaders[key] = val);

        const resBody = error ? null : await getResponseBody(response);
        const { headers: redactedResHeaders, body: redactedResBody } = redact(resHeaders, resBody);

        const log = {
            id,
            url: urlString, // Use the string version
            method,
            status: error ? 0 : response.status,
            statusText: error ? error.message : response.statusText,
            startTime: start,
            endTime: end,
            duration: end - start,
            request: {
                headers: redactedReqHeaders,
                body: safeJsonParse(redactedReqBody)
            },
            response: {
                headers: redactedResHeaders,
                body: safeJsonParse(redactedResBody),
                size: resBody?.length || 0
            },
            type: 'Fetch',
            mocked: false,
            error: !!error
        };

        sendLog(log);

        if (error) {
            throw error;
        }

        return response;
    };
    // --- End: Fetch Interceptor ---


    // --- Start: XHR Interceptor ---
    const originalXhrOpen = XMLHttpRequest.prototype.open;
    const originalXhrSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url) {
        this._apiTrackerInfo = {
            method: method.toUpperCase(),
            url: String(url), // FIX: Ensure URL is a string
            id: `xhr_${Date.now()}_${Math.random()}`
        };
        originalXhrOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function (body) {
        const info = this._apiTrackerInfo;
        const start = performance.now();

        // TODO: Add XHR Mocks (more complex, skipping for this MVP)

        this.addEventListener('loadend', () => {
            const end = performance.now();

            const reqHeaders = {}; // Note: Getting XHR request headers is hard.
            const { headers: redactedReqHeaders, body: redactedReqBody } = redact(reqHeaders, body);

            const resHeaders = {};
            this.getAllResponseHeaders().trim().split(/[\r\n]+/).forEach(line => {
                const parts = line.split(': ');
                resHeaders[parts.shift()] = parts.join(': ');
            });
            const { headers: redactedResHeaders, body: redactedResBody } = redact(resHeaders, this.responseText);

            const log = {
                id: info.id,
                url: info.url, // Already a string from .open()
                method: info.method,
                status: this.status,
                statusText: this.statusText,
                startTime: start,
                endTime: end,
                duration: end - start,
                request: {
                    headers: redactedReqHeaders,
                    body: safeJsonParse(redactedReqBody)
                },
                response: {
                    headers: redactedResHeaders,
                    body: safeJsonParse(redactedResBody),
                    size: this.responseText.length
                },
                type: 'XHR',
                mocked: false,
                error: this.status < 200 || this.status >= 400
            };
            sendLog(log);
        });

        originalXhrSend.apply(this, arguments);
    };
    // --- End: XHR Interceptor ---

})();