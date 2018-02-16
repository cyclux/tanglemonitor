/*eslint no-console: ["error", { allow: ["log", "error"] }] */
/* global window, document, console, WebSocket, IOTA */
'use strict';

// Set canvas and dimensions
const c = document.getElementById('canvas');
const ctx = c.getContext('2d');

const iotajs = new IOTA({
    'host': 'http://nodes.iota.fm', // http://field.carriota.com:80 => CORS issue
    'port': 80
});

const offsetWidth = 200;
const offsetHeight = 60;
const cWidth = c.width - offsetWidth;
//const cHeight = c.height - offsetHeight;
const margin = 100;

const pxSize = 10;
const txPerLine = Math.ceil(cWidth / pxSize);
const pxColorUnconf = {r:0, g:0, b:0, a:1};
const pxColorConf = {r:0, g:255, b:0, a:1};
const pxColorMilestone = {r:0, g:0, b:255, a:1};

const initialTime = Date.now();

let txList = [];
let confList = [];
let timestamps = [];
let totalConfRate = 0;
let totalTransactions = 0;
let totalTPS = 0;
let milestones = [];
let milestonesTrunk = [];
let timer = [];

// Get confirmation status for current transactions
const GetTxConfStatus = TxList_GetTxConfStatus => {

    // Store temporary polling chunks
    let confListTemp = [];

    const getLatestInclusion = (txChunksWrapper) => {
        // Get current milestone
        iotajs.api.getNodeInfo( (e, nodeInfo) => {

            if (e) {
                console.error('Error getNodeInfo: ', e);

            } else {
                // Fetch chunk from polling pool
                const transactionHashes = txChunksWrapper.shift();

                if (milestones.indexOf(nodeInfo.latestMilestone) === -1){
                    // Collect milestones
                    milestones.push(nodeInfo.latestMilestone);
                    // Get trunk for milestone
                    iotajs.api.getTransactionsObjects([nodeInfo.latestMilestone], (e, txObjects) => {
                        if(e){
                            console.error('Error getTransactionsObjects: ', e);
                        } else {
                            // Collect trunk milestone in seperate list
                            // -> needed to display miletone timeline labels only once
                            milestonesTrunk.push(txObjects[0].trunkTransaction);
                        }
                    });
                }

                iotajs.api.getInclusionStates( transactionHashes, [nodeInfo.latestMilestone], (e, result) => {
                    if (e){
                       console.error('Error getInclusionStates: ', e);

                    } else {
                        confListTemp = confListTemp.concat(result);

                        // If TX chunk left make another call
                        if (txChunksWrapper.length > 0) {
                            getLatestInclusion(txChunksWrapper);

                        } else {
                            // Calculate confirmation rate of all TX
                            totalConfRate = Math.round(confListTemp.filter(tx => tx === true).length / confListTemp.length * 10000) / 100;

                            // If milestone TX hash found swap entry to recogninze for later color selection
                            milestones.map( milestone => {
                                const milestoneIndex = txList.indexOf(milestone);
                                confListTemp[milestoneIndex] = 'milestone';
                            });
                            // Same for trunk milestone
                            milestonesTrunk.map( milestone_trunk => {
                                const milestoneIndexTrunk = txList.indexOf(milestone_trunk);
                                confListTemp[milestoneIndexTrunk] = 'milestone_trunk';
                            });
                            // If no polling chunks left, make temp confirmation list to current list
                            confList = confListTemp;
                        }
                    }
                });
            }
        });
    }

    // Workaround -> Split transaction list into '999 TX chunks' for confirmation status polling,
    // because splice() breaks out of scope and tampers with txList array.
    // Same when +999 TX get passed to getLatestInclusion, which also slits polling into 999 TX chunks.
    // No idea how splice can tamper with arrays out of scope, maybe iota.lib.js issue?

    // Create 999 chunks of calls and store in wrapper
    let txChunksWrapper = [];
    while (TxList_GetTxConfStatus.length > 0) {

        if (TxList_GetTxConfStatus.length > 999) {
            txChunksWrapper.push(TxList_GetTxConfStatus.slice(0, 999));
            TxList_GetTxConfStatus = TxList_GetTxConfStatus.slice(1000);

        } else {
            txChunksWrapper.push(TxList_GetTxConfStatus);
            TxList_GetTxConfStatus = [];
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
    const txAmount = txList_DrawCanvas.length;
    // Create array of transaction pixels including respective confirmation status
    let pxls = [];
    Array.from(Array(txAmount), (_, i) => {

        const lineCount = calcLineCount(i, pxSize, cWidth);
        const confStatus = confList[i];

        pxls.push({
            x: i * pxSize - (lineCount * pxSize * txPerLine),
            y: lineCount * pxSize,
            conf: confStatus,
            time: timestamps[i]
        });
    });

    // Create header metrics and legend labels
    ctx.font = "13px Consolas";
    ctx.fillStyle = "black";
    ctx.textBaseline = 'hanging';
    ctx.textAlign = "left";

    ctx.fillText('Total TX count    ' + totalTransactions, margin + 10, 10);
    ctx.fillText('Avg. TPS          ' + totalTPS, margin + 10, 25);
    ctx.fillText('Avg. conf. rate   ' + totalConfRate + ' %', margin + 10, 40);

    ctx.fillText('Unconfirmed', margin + 405, 10);
    ctx.fillText('Confirmed', margin + 405, 25);
    ctx.fillText('Milestone', margin + 405, 40);

    ctx.fillStyle = 'rgba(' + 0 + ',' + 0 + ',' + 0 + ',' + 1 + ')';
    ctx.fillRect(margin + 390, 10, pxSize, pxSize);
    ctx.fillStyle = 'rgba(' + 0 + ',' + 255 + ',' + 0 + ',' + 1 + ')';
    ctx.fillRect(margin + 390, 25, pxSize, pxSize);
    ctx.fillStyle = 'rgba(' + 0 + ',' + 0 + ',' + 255 + ',' + 1 + ')';
    ctx.fillRect(margin + 390, 40, pxSize, pxSize);

    // Draw TX pixels and additional metrics
    pxls.map( (px, pixelIndex ) => {
        // Declare amount of TX for calculation of TPS / confirmation rate metrics
        const confRateRange = 100;
        if (pixelIndex % confRateRange == 0){

            const step = pixelIndex / confRateRange;

            ctx.font = "11px Consolas";
            ctx.fillStyle = "black";
            ctx.textBaseline = 'hanging';
            ctx.textAlign = "right";

            // Calc current TPS and display appropriately
            const confRateRangeList = confList.slice(step * confRateRange, step * confRateRange + confRateRange);
            const confRate = Math.round(confRateRangeList
                .filter(tx => tx === true || tx === 'milestone' || tx === 'milestone_trunk').length / confRateRangeList.length * 1000) / 10;

            const tps = Math.round(100 / ((timer[step+1] - timer[step]) / 1000) * 10) / 10;

            ctx.fillText((isNaN(confRate) ? '0' : confRate) + '%' + (isNaN(tps) ? ' [...]' : ' [' + tps.toFixed(1) + ' TPS]'), margin - 5, px.y + offsetHeight + 5);
        }
        // Adapt TX color to confirmation or milestone status
        let pxColor;
        if (px.conf === false || px.conf === undefined){
            pxColor = pxColorUnconf;

        } else if (px.conf === 'milestone') {

            ctx.font = "11px Consolas";
            ctx.fillStyle = "black";
            ctx.textBaseline = 'hanging';
            ctx.textAlign = "left";

            pxColor = pxColorMilestone;
            const minElapsed = Math.floor( (Math.floor(Date.now() / 1000) - px.time) / 60 );
            ctx.fillText(minElapsed + ' min ago', margin + cWidth + 5, px.y + offsetHeight);

        } else if (px.conf === 'milestone_trunk') {
            pxColor = pxColorMilestone;
        } else {
            pxColor = pxColorConf;
        }
        // Display actual TX pixel
        ctx.fillStyle = 'rgba(' + pxColor.r + ',' + pxColor.g + ',' + pxColor.b + ',' + pxColor.a + ')';
        ctx.fillRect(px.x + margin, px.y + offsetHeight, pxSize, pxSize);
        ctx.strokeStyle = '#cccccc';
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

    connection.onerror = (error) => {
        console.log('WebSocket Error ' + error);
    };

    connection.onmessage = (response) => {

        const newTx = JSON.parse(response.data);
        const hash = newTx['transaction']['hash'];
        const timestamp = newTx['transaction']['receivedAt'];

        txList.push(hash);
        timestamps.push(timestamp);
        totalTransactions = txList.length;

        if((totalTransactions - 1) % 100 === 0){
            timer.push(Date.now());
        }

        totalTPS = Math.round(totalTransactions / ((Date.now() - initialTime) / 1000) * 100) / 100;

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
