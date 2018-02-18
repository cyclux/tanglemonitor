/*eslint no-console: ["error", { allow: ["log", "error"] }] */
/* global window, document, console, WebSocket, IOTA */
'use strict';

// Set canvas and dimensions
const c = document.getElementById('canvas');
const ctx = c.getContext('2d');
const tooltip = document.getElementById('tooltip');

const iotajs = new IOTA({
    'host': 'https://nodes.thetangle.org', // http://field.carriota.com:80 => CORS issue , http://nodes.iota.fm:80 => no https
    'port': 443
});

const offsetWidth = 200;
const offsetHeight = 60;
const cWidth = c.width - offsetWidth;
//const cHeight = c.height - offsetHeight;
const margin = 100;

const pxSize = 10;
const txPerLine = Math.ceil(cWidth / pxSize);

const textColor = "#000000";
const strokeColor = '#cccccc';
const fontFace = 'Consolas';
const fontSizeHeader = '13px';
const fontSizeAxis = '11px';

const pxColorUnconf = {r:0, g:0, b:0, a:1};
const pxColorConf = {r:0, g:255, b:0, a:1};
const pxColorMilestone = {r:0, g:0, b:255, a:1};

const initialTime = Date.now();

let txList = [];
let milestoneBuffer = "";
let milestoneTrunkBuffer = "";
let totalConfRate = 0;
let totalTransactions = 0;
let totalTPS = 0;

let mousePos;
let pixelMap = [];

let timer = [];
let rateLimiter = 0;
let txOfMousePosition = {};

// Collect and store mouse position for TX info at mouseover
const GetMousePos = (c, evt) => {
    let rect = c.getBoundingClientRect();
    return {
        x: evt.clientX - rect.left,
        y: evt.clientY - rect.top,
        xReal: evt.clientX,
        yReal: evt.clientY
    };
}

const GetTXofMousePosition = (mousePosition) => {
    mousePosition.y = mousePosition.y - offsetHeight;
    mousePosition.x = mousePosition.x - margin;
    const txAtMouse = pixelMap.reduce( (acc, tx) => {

        if(mousePosition.x >= tx.x && mousePosition.x < tx.x + pxSize &&
            mousePosition.y >= tx.y && mousePosition.y < tx.y + pxSize
        ){
            acc = tx;
        }
        return acc;
    }, 0 );
    return txAtMouse;
}

const OpenLink = () => {
    if(txOfMousePosition.hash){
        window.open(`https://thetangle.org/transaction/${txOfMousePosition.hash}`);
    }
}

/*
Listen to mousemove and search for TX at position of mousecursor
Limitation of function calls for performance reasons
Kind of workaround to not need a dedicated element for each TX pixel
*/
c.addEventListener('mousemove', evt => {
    const now = Date.now();
    if (now - rateLimiter > 25) {
        mousePos = GetMousePos(c, evt);
        txOfMousePosition = GetTXofMousePosition(mousePos);

        if(txOfMousePosition.hash){
            tooltip.innerHTML = txOfMousePosition.hash;
            tooltip.style.display = 'block';
            tooltip.style.top = `${mousePos.yReal+15}px`;
            tooltip.style.left = `${mousePos.xReal+15}px`;
            document.body.style.cursor = "pointer";

        } else {
            tooltip.style.display = 'none';
            document.body.style.cursor = "auto";
            txOfMousePosition = {};
        }
        rateLimiter = Date.now();
    }
}, false);

c.addEventListener('click', () => {
    OpenLink();
}, false);

// Get confirmation status for current transactions
const GetTxConfStatus = txList_GetTxConfStatus => {

    // Store temporary polling chunks
    let confListTemp = [];

    const getLatestInclusion = (txChunksWrapper) => {
        // Get current milestone
        iotajs.api.getNodeInfo( (e, nodeInfo) => {

            if (e) {
                console.error('Error getNodeInfo: ', e);

            } else {
                // Fetch chunk from polling pool
                const transactionHashes = txChunksWrapper.shift()
                    .reduce( (acc, tx) => acc.concat(tx.hash), []);

                if (nodeInfo.latestMilestone !== milestoneBuffer) {
                    iotajs.api.getTransactionsObjects([nodeInfo.latestMilestone], (e, txObjects) => {
                        if(e){
                            console.error('Error getTransactionsObjects: ', e);
                        } else {
                            // Collect trunk milestone in seperate list
                            // -> needed to display miletone timeline labels only once
                            milestoneTrunkBuffer = txObjects[0].trunkTransaction;

                            const milestoneIndex = txList.findIndex(tx => tx.hash === nodeInfo.latestMilestone);
                            const milestoneTrunkIndex = txList.findIndex(tx => tx.hash === milestoneTrunkBuffer);

                            if (milestoneIndex !== -1) {
                                txList[milestoneIndex].milestone = true;
                                txList[milestoneTrunkIndex].milestone = 'trunk';
                            }
                        }
                    });
                }

                milestoneBuffer = nodeInfo.latestMilestone;

                iotajs.api.getInclusionStates( transactionHashes, [nodeInfo.latestMilestone], (e, inclusionStates) => {
                    if (e){
                       console.error('Error getInclusionStates: ', e);

                    } else {
                        confListTemp = confListTemp.concat(inclusionStates);
                        // Search for TX hash in list and update status if confirmed
                        transactionHashes.map( (txHash, index) => {
                            if (confListTemp[index] === true){
                                const hashIndex = txList.findIndex(tx => tx.hash === txHash);
                                txList[hashIndex].confirmed = true;
                            }
                        });
                        // If TX chunk left make another call
                        if (txChunksWrapper.length > 0) { getLatestInclusion(txChunksWrapper); }
                    }
                });
            }
        });
    }

    // Filter confirmed transactions for status polling
    txList_GetTxConfStatus = txList_GetTxConfStatus.reduce( (acc, tx) => {
        if (tx.confirmed !== true){
            acc.push(tx);
        }
        return acc;
    }, [] );

    /*
    Workaround -> Split transaction list into '999 TX chunks' for confirmation status polling,
    because splice() breaks out of scope and tampers with txList array. Don't know why yet..
    Same when +999 TX get passed to getLatestInclusion, which also splits polling into 999 TX chunks.
    */

    // Create 999 chunks of calls and store in wrapper
    let txChunksWrapper = [];
    while (txList_GetTxConfStatus.length > 0) {

        if (txList_GetTxConfStatus.length > 999) {
            txChunksWrapper.push(txList_GetTxConfStatus.slice(0, 999));
            txList_GetTxConfStatus = txList_GetTxConfStatus.slice(1000);

        } else {
            txChunksWrapper.push(txList_GetTxConfStatus);
            txList_GetTxConfStatus = [];
        }
    }
    // Start polling for confirmation status
    getLatestInclusion(txChunksWrapper);
}

// Get current line position
const calcLineCount = (i, pxSize, cWidth) => {
    const lines = Math.floor(i * pxSize / cWidth);
    return lines;
}

// Draw canvas iteration
const DrawCanvas = (txList_DrawCanvas) => {
    // Clear screen
    ctx.clearRect(0, 0, cWidth + offsetWidth, c.height);

    // Create array of transaction pixels including respective confirmation status
    let pxls = [];
    txList_DrawCanvas.map( (tx, i) => {
        const lineCount = calcLineCount(i, pxSize, cWidth);

        pxls.push({
            x: i * pxSize - (lineCount * pxSize * txPerLine),
            y: lineCount * pxSize,
            hash: tx.hash,
            confirmed: tx.confirmed,
            milestone: tx.milestone,
            time: tx.timestamp
        });
    } );

    // Store current pixelmap in global variable for local TX polling
    pixelMap = pxls;

    // Create header metrics and legend labels
    ctx.font = `${fontSizeHeader} ${fontFace}`;
    ctx.fillStyle = textColor;
    ctx.textBaseline = 'hanging';
    ctx.textAlign = "left";

    ctx.fillText('Total TX count    ' + totalTransactions, margin + 10, 10);
    ctx.fillText('Avg. TPS          ' + totalTPS, margin + 10, 25);
    ctx.fillText('Avg. conf. rate   ' + totalConfRate + ' %', margin + 10, 40);

    ctx.fillText('Unconfirmed', margin + 405, 10);
    ctx.fillText('Confirmed', margin + 405, 25);
    ctx.fillText('Milestone', margin + 405, 40);

    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.fillRect(margin + 390, 10, pxSize, pxSize);
    ctx.fillStyle = 'rgba(0,255,0,1)';
    ctx.fillRect(margin + 390, 25, pxSize, pxSize);
    ctx.fillStyle = 'rgba(0,0,255,1)';
    ctx.fillRect(margin + 390, 40, pxSize, pxSize);

    // Draw TX pixels and additional metrics
    pxls.map( (px, pixelIndex ) => {
        // Declare amount of TX for calculation of TPS / confirmation rate metrics
        const confRateRange = 100;
        if (pixelIndex % confRateRange == 0){

            const step = pixelIndex / confRateRange;

            ctx.font = `${fontSizeAxis} ${fontFace}`;
            ctx.fillStyle = textColor;
            ctx.textBaseline = 'hanging';
            ctx.textAlign = "right";

            // Calc current TPS and display appropriately
            const confRateRangeList = txList.slice(step * confRateRange, step * confRateRange + confRateRange);
            const confRate = Math.round(confRateRangeList
                .filter(tx => tx.confirmed === true)
                .length / confRateRangeList.length * 1000) / 10;

            const tps = Math.round(100 / ((timer[step+1] - timer[step]) / 1000) * 10) / 10;

            ctx.fillText((isNaN(confRate) ? '0' : confRate) + '%' + (isNaN(tps) ? ' [...]' : ' [' + tps.toFixed(1) + ' TPS]'),
            margin - 5, px.y + offsetHeight + 5);
        }
        // Adapt TX color to confirmation or milestone status
        let pxColor;
        if (px.confirmed === false || px.confirmed === undefined){
            pxColor = pxColorUnconf;

        } else if (px.milestone === true) {

            ctx.font = `${fontSizeAxis} ${fontFace}`;
            ctx.fillStyle = textColor;
            ctx.textBaseline = 'hanging';
            ctx.textAlign = "left";

            pxColor = pxColorMilestone;
            const minElapsed = Math.floor( (Math.floor(Date.now() / 1000) - px.time) / 60 );
            ctx.fillText(`${minElapsed} min ago`, margin + cWidth + 5, px.y + offsetHeight);

        } else if (px.milestone === 'trunk') {
            pxColor = pxColorMilestone;
        } else {
            pxColor = pxColorConf;
        }
        // Display actual TX pixel
        ctx.fillStyle = 'rgba(' + pxColor.r + ',' + pxColor.g + ',' + pxColor.b + ',' + pxColor.a + ')';
        ctx.fillRect(px.x + margin, px.y + offsetHeight, pxSize, pxSize);
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(px.x + margin, px.y + offsetHeight, pxSize, pxSize);

     });
}

const Main = () => {

    // Websocket
    const connection = new WebSocket('wss://api.thetangle.org/v1/live', ['soap', 'xmpp']);

    connection.onopen = () => {
        connection.send('{"subscriptions":{"transactions":true}}');
    };

    connection.onerror = (e) => {
        console.log('WebSocket Error ' + e);
    };

    connection.onmessage = (response) => {

        const newTx = JSON.parse(response.data);
        const hash = newTx['transaction']['hash'];
        const timestamp = newTx['transaction']['receivedAt'];

        txList.push({'hash': hash, 'confirmed': false, 'timestamp': timestamp, 'milestone': false});

        // Calculate metrics
        totalTransactions = txList.length;
        if((totalTransactions - 1) % 100 === 0){
            timer.push(Date.now());
        }
        totalTPS = Math.round(totalTransactions / ((Date.now() - initialTime) / 1000) * 100) / 100;

        // Calculate confirmation rate of all TX
        totalConfRate = Math.round(txList
            .filter(tx => tx.confirmed === true).length / txList.length * 10000
        ) / 100;

        // Adapt canvas height to amount of transactions (pixel height)
        if(c.height < timer.length * pxSize * 2 + offsetHeight + 30) {
            c.height = c.height + 50;
        }
        // Update canvas on new incomming TX
        DrawCanvas(txList);
    };
    // Set interval for polling confirmation status
    window.setInterval( () => { GetTxConfStatus(txList); }, 10000);
}
// Init
Main();
