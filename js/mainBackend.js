/*eslint no-console: ["error", { allow: ["log", "error"] }] */
/* global window, pako, document, fetch, console, _ */
'use strict';

/* Set canvas and dimensions */
const c = document.getElementById('canvas');
const ctx = c.getContext('2d');
const tooltip = document.getElementById('tooltip');

const offsetWidth = 200;
const offsetHeight = 60;
const cWidth = c.width - offsetWidth;
const margin = 100;

const pxSize = 10;
const txPerLine = Math.ceil(cWidth / pxSize);

const textColor = "#000000";
const strokeColorNorm = '#cccccc';
const strokeColorSelect = '#ff0000';
const fontFace = 'Consolas';
const fontSizeHeader = '13px';
const fontSizeAxis = '11px';

const pxColorUnconf = {r:0, g:0, b:0, a:1};
const pxColorConf = {r:0, g:255, b:0, a:1};
const pxColorMilestone = {r:0, g:0, b:255, a:1};

let txList = [];
let selectedAddress = '';
let totalConfRate = 0;
let totalConfirmations = [];
let totalConfirmationTime = 0;
let totalTransactions = 0;
let totalTPS = 0;
let totalCTPS = 0;

let topList = [];
let toplistAdditional = 0;
let topListCount = 0;

let mousePos;
let pixelMap = [];

let timer = [];
let rateLimiter = 0;
let txOfMousePosition = {};

const ChangeAddress = () => {
    selectedAddress = document.getElementById('address_input').value.substring(0,81);
    document.getElementById('status').innerHTML = `Address selection changed`;
}

document.getElementById('address_button').onclick = function(){ChangeAddress()};

/* Table creation for toplist */
function createTable(currentList) {

    const mytable = document.getElementById("toplist");
    mytable.innerHTML = "";
    const tablehead = document.createElement("thead");
    const tablebody = document.createElement("tbody");
    const head_tr = document.createElement("tr");

    topListCount = 0;
    currentList.length >= 20 ? topListCount = 20 : topListCount = currentList.length;
    topListCount = topListCount + toplistAdditional;

    /* Prevent greater topListCount than actual length under any circumstance */
    if(topListCount >= currentList.length) {
        topListCount = currentList.length
    }

    for(let j = 0; j < topListCount; j++) {
        const current_row = document.createElement("tr");

        for(let i = 0; i < currentList[0].length; i++) {
            const current_cell = document.createElement("td");
            current_cell.addEventListener('mouseenter', () => {
                selectedAddress = current_cell.getAttribute('tx');
            }, false);

            current_cell.addEventListener('click', () => {
                OpenLink(current_cell.getAttribute('tx'));
            }, false);
            /* Insert table contents */
            let currenttext;

            switch(i) {
                case 0:
                    currenttext = j + 1;
                break;
                case 1:
                    currenttext = currentList[j][0].substring(0,35) + '...';
                break;
                case 2:
                    currenttext = currentList[j][2];
                break;
                case 3:
                    currenttext = currentList[j][3];
                break;
                case 4:
                    currenttext = currentList[j][4];
                break;
                case 5:
                    currenttext = `${currentList[j][5] === Infinity ? 'inf.' : currentList[j][5].toFixed(2)}`;
                break;
                case 6:
                    currenttext = `${currentList[j][6] === Infinity ? 'inf.' : currentList[j][6] > 0 ? '+' : ''}${currentList[j][6] < Infinity ? currentList[j][6].toFixed(0)+'%' : ''}`;
                break;
                case 7:
                    currenttext = currentList[j][7].toFixed(2);
                break;
                case 8:
                    currenttext = currentList[j][8].toFixed(2);
                break;
                case 9:
                    currenttext = currentList[j][9].toFixed(1) + ' min';
                break;
                case 10:
                    currenttext = `${currentList[j][10] > 0 ? '+' : ''}${currentList[j][10].toFixed(1)}%`;
                break;

                default:
                    currenttext = 'N/A';
            }

            const currenttextNode = document.createTextNode(currenttext);
            current_cell.appendChild(currenttextNode);
            current_cell.setAttribute('tx', currentList[j][0]);

            /* Colorize dependent of values */
            if(currentList[j][6] >= 0 && i == 6){
                current_cell.setAttribute('style', 'color: #008000');
            } else if (currentList[j][6] < 0 && i == 6) {
                current_cell.setAttribute('style', 'color: #ff0000');
            } else if (currentList[j][10] >= 0 && i == 10) {
                current_cell.setAttribute('style', 'color: #ff0000');
            } else if (currentList[j][10] < 0 && i == 10) {
                current_cell.setAttribute('style', 'color: #008000');
            }

            current_row.appendChild(current_cell);
        }
        tablebody.appendChild(current_row);
    }

    for(let i = 0; i < currentList[0].length; i++) {
        const current_cell = document.createElement("td");

        let currenttext;

        switch(i) {
            case 0:
                currenttext = '#';
            break;
            case 1:
                currenttext = 'Address';
            break;
            case 2:
                currenttext = 'Total';
            break;
            case 3:
                currenttext = 'Confirmed';
            break;
            case 4:
                currenttext = 'Unconfirmed';
            break;
            case 5:
                currenttext = 'C.Ratio';
            break;
            case 6:
                currenttext = '±Avg.C.Ratio';
            break;
            case 7:
                currenttext = 'TPS';
            break;
            case 8:
                currenttext = 'CTPS';
            break;
            case 9:
                currenttext = '~C.Time';
            break;
            case 10:
                currenttext = '±Avg.Time';
            break;

            default:
                currenttext = 'N/A';
        }

        const currenttextNode = document.createTextNode(currenttext);
        current_cell.appendChild(currenttextNode);
        head_tr.appendChild(current_cell);
    }

    tablehead.appendChild(head_tr);
    mytable.appendChild(tablehead);
    mytable.appendChild(tablebody);

}

/* Collect and store mouse position for TX info at mouseover */
const GetMousePos = (c, evt) => {

    /* Calculate mouse position considering scroll position */
    if (evt.pageX == null && evt.clientX != null) {
        let doc = document.documentElement, body = document.body;

        evt.pageX = evt.clientX
                + (doc && doc.scrollLeft || body && body.scrollLeft || 0)
                - (doc.clientLeft || 0);

        evt.pageY = evt.clientY
                + (doc && doc.scrollTop || body && body.scrollTop || 0)
                - (doc.clientTop || 0);
    }
    /* Mouse position within canvas */
    let rect = c.getBoundingClientRect();
    return {
        x: evt.clientX - rect.left,
        y: evt.clientY - rect.top,
        xReal: evt.pageX,
        yReal: evt.pageY
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

const OpenLink = (tx) => {
    if(tx){
        window.open(`https://thetangle.org/address/${tx}`);
    }
    if(txOfMousePosition.hash){
        window.open(`https://thetangle.org/transaction/${txOfMousePosition.hash}`);
    }
}

/*
Listen to mousemove and search for TX at position of mousecursor
Arbitrary rate limitation of function calls for performance reasons
Kind of workaround to not need a dedicated element for each TX pixel which floods the DOM
*/
c.addEventListener('mousemove', evt => {
    const now = Date.now();
    if (now - rateLimiter > 25) {
        mousePos = GetMousePos(c, evt);
        txOfMousePosition = GetTXofMousePosition(mousePos);

        if(txOfMousePosition.hash){
            let txConfirmationTime = _.round(txOfMousePosition.confirmed / 60, 2);
            txConfirmationTime !== 0 ? txConfirmationTime = txConfirmationTime + ' Minutes' : txConfirmationTime = 'Not confirmed yet';

            tooltip.innerHTML = `Address: ${txOfMousePosition.address}<br>TX Hash: ${txOfMousePosition.hash}<br>Confirmation Time: ${txConfirmationTime}`;
            selectedAddress = txOfMousePosition.address;
            tooltip.style.display = 'block';
            tooltip.style.top = `${mousePos.yReal+15}px`;
            tooltip.style.left = `${mousePos.xReal+15}px`;
            document.body.style.cursor = "pointer";

        } else {
            tooltip.style.display = 'none';
            document.body.style.cursor = "auto";
            txOfMousePosition = {};
            selectedAddress = '';
        }
        rateLimiter = Date.now();
    }
}, false);

/* Additional event listeners */
c.addEventListener('click', () => {
    OpenLink(false);
}, false);

document.getElementById('toplist-more').addEventListener('click', () => {
    toplistAdditional = toplistAdditional + 5;
    createTable(topList);
}, false);

/* Get current line position to draw each */
const calcLineCount = (i, pxSize, cWidth) => {
    const lines = Math.floor(i * pxSize / cWidth);
    return lines;
}

/* Draw canvas iteration */
const DrawCanvas = (txList_DrawCanvas) => {
    /* Clear screen on each tick */
    ctx.clearRect(0, 0, cWidth + offsetWidth, c.height);

    /* Create array of transaction pixels including respective confirmation status */
    let pxls = [];
    txList_DrawCanvas.map( (tx, i) => {
        const lineCount = calcLineCount(i, pxSize, cWidth);

        pxls.push({
            x: i * pxSize - (lineCount * pxSize * txPerLine),
            y: lineCount * pxSize,
            hash: tx.hash,
            confirmed: tx.confirmed,
            address: tx.address,
            milestone: tx.milestone,
            time: tx.timestamp
        });
    } );

    /* Store current pixelmap in global variable for local TX polling */
    pixelMap = pxls;

    /* Create header metrics and legend labels */
    ctx.font = `${fontSizeHeader} ${fontFace}`;
    ctx.fillStyle = textColor;
    ctx.textBaseline = 'hanging';
    ctx.textAlign = "left";

    ctx.fillText('Total TX count    ' + totalTransactions, margin + 10, 10);
    ctx.fillText('Avg. TPS          ' + totalTPS, margin + 10, 25);
    ctx.fillText('Avg. conf. rate   ' + totalConfRate + ' %', margin + 10, 40);
    ctx.fillText('Avg. conf. time  ' + totalConfirmationTime + ' min', margin + 220, 10);
    ctx.fillText('Avg. CTPS        ' + totalCTPS, margin + 220, 25);

    ctx.fillText('Unconfirmed', cWidth, 10);
    ctx.fillText('Confirmed', cWidth, 25);
    ctx.fillText('Milestone', cWidth, 40);

    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.fillRect(cWidth - 15, 10, pxSize, pxSize);
    ctx.fillStyle = 'rgba(0,255,0,1)';
    ctx.fillRect(cWidth - 15, 25, pxSize, pxSize);
    ctx.fillStyle = 'rgba(0,0,255,1)';
    ctx.fillRect(cWidth - 15, 40, pxSize, pxSize);

    /*  Draw TX pixels and additional metrics */
    pxls.map( (px, pixelIndex ) => {
        /* Declare amount of TX for calculation of TPS / confirmation rate metrics */
        const confRateRange = (txPerLine*2);
        if (pixelIndex % confRateRange == 0){

            const step = pixelIndex / confRateRange;

            ctx.font = `${fontSizeAxis} ${fontFace}`;
            ctx.fillStyle = textColor;
            ctx.textBaseline = 'hanging';
            ctx.textAlign = "right";

            /* Calc current TPS and display appropriately */
            const confRateRangeList = txList.slice(step * confRateRange, step * confRateRange + confRateRange);
            //console.log(confRateRangeList.length);
            const confRate = Math.round(confRateRangeList
                .filter(tx => tx.confirmed !== false)
                .length / confRateRangeList.length * 1000) / 10;

            const tps = Math.round(100 / ((timer[step+1] - timer[step]) ) * 10) / 10;

            ctx.fillText((isNaN(confRate) ? '0' : confRate) + '%' + (isNaN(tps) ? ' [...]' : ' [' + tps.toFixed(1) + ' TPS]'),
            margin - 5, px.y + offsetHeight + 5);
        }

        /* Adapt TX color to confirmation or milestone status */
        let pxColor;
        let strokeCol;

        if (px.milestone === true) {

            ctx.font = `${fontSizeAxis} ${fontFace}`;
            ctx.fillStyle = textColor;
            ctx.textBaseline = 'hanging';
            ctx.textAlign = "left";

            pxColor = pxColorMilestone;
            strokeCol = strokeColorNorm;
            const minElapsed = Math.floor( (Math.floor(Date.now() / 1000) - px.time) / 60 );
            ctx.fillText(`${minElapsed} min ago`, margin + cWidth + 5, px.y + offsetHeight);
        }

        if (px.milestone === 'trunk') {
            pxColor = pxColorMilestone;
            strokeCol = strokeColorNorm;
        }
        if (px.confirmed !== false && px.milestone === false) {
            pxColor = pxColorConf;
            strokeCol = strokeColorNorm;
        }
        if (px.confirmed === false || px.confirmed === undefined){
            pxColor = pxColorUnconf;
            strokeCol = strokeColorNorm;
        }
        if (px.address === selectedAddress){
            strokeCol = strokeColorSelect;
        }
        /* Display actual TX pixel */
        ctx.fillStyle = 'rgba(' + pxColor.r + ',' + pxColor.g + ',' + pxColor.b + ',' + pxColor.a + ')';
        ctx.fillRect(px.x + margin, px.y + offsetHeight, pxSize, pxSize);
        ctx.strokeStyle = strokeCol;
        ctx.lineWidth = 1;
        ctx.strokeRect(px.x + margin, px.y + offsetHeight, pxSize, pxSize);

     });
}

const Main = () => {
    /* Render canvas tick rate */
    window.setInterval( () => {
        DrawCanvas(txList);
    }, 100);

    window.setInterval( () => {

        //https://junglecrowd.org/txDB/txHistory.gz.json
        //http://localhost/IOTA-Confirmation-Visualizer/httpdocs/txDB/txHistory.gz.json

        /* Fetch current tangle TX from remote backend */
        fetch('https://junglecrowd.org/txDB/txHistory.gz.json', {cache: 'no-cache'})
        .then( json_test => json_test.json() )
        .then( b64encoded => {return window.atob(b64encoded.txArrayCompressed)})
        .then( decompress => {
            try {
                return pako.inflate(decompress, { to: 'string' });
            } catch (err) {
                console.log(err);
            }
        })
        .then( jsonParse => JSON.parse(jsonParse) )
        .then( txHistory => {

            document.getElementById('loading').style.display = 'none';

            txList = txHistory;

            /* Calculate metrics */
            totalTransactions = txList.length;

            /* Do this on every 100 or x amount of TX */
            let timerTemp = [];
            txList.map( (tx, txNumber) => {
                if(txNumber % (txPerLine*2) === 0){
                    timerTemp.push(tx.timestamp);
                }
            });
            timer = timerTemp;

            totalConfirmations = txList
                .reduce( (acc, tx) => {
                if(tx.confirmed !== false){
                acc.push(tx.confirmed);
                }
                return acc;
            }, [] );

            /* Calculate confirmation rate of all TX */
            totalConfRate = Math.round(totalConfirmations.length / txList.length * 10000) / 100;
            /* Calculate average confirmation time of all confirmed TX */
            totalConfirmationTime = _.mean(totalConfirmations);
            totalConfirmationTime = _.round(totalConfirmationTime / 60, 1);

            if (totalTransactions > 0){
                totalTPS = Math.round(totalTransactions / ((Date.now() - (txList[0].timestamp * 1000)) / 1000) * 100) / 100;
                totalCTPS = Math.round(totalConfirmations.length / ((Date.now() - (txList[0].timestamp * 1000)) / 1000) * 100) / 100;
            }

            /* Create toplist */
            const partitioned = _.partition(txList, 'confirmed');
            const confirmed = partitioned[0];
            const unconfirmed = partitioned[1];

            const confirmedTotalCount = confirmed.length;
            const unconfirmedTotalCount = unconfirmed.length;

            // _.groupBy(['one', 'two', 'three'], 'length');  instread of partition?
            const confirmedCounted = _.countBy(confirmed, 'address');
            const entries = Object.entries(confirmedCounted);
            const sorted = entries.sort((b, a) => a[1] - b[1]);

            sorted.map( (tx, index) => {
                const unconfirmedOnes = unconfirmed.filter( txs => txs.address === tx[0]).length;
                const confirmedOnes = tx[1];
                const confirmationTimeCollector = confirmed.reduce( (acc, txs) => {

                    if (txs.address === tx[0]){
                        acc[0].push(txs.confirmed);
                    } else {
                        acc[1].push(txs.confirmed);
                    }
                    return acc;}, [[], []]);
                const confirmationTime = confirmationTimeCollector[0];
                const confirmationTimeOthers = confirmationTimeCollector[1];
                const confirmationTimeMeanOthers = _.mean(confirmationTimeOthers) / 60;
                const confirmationTimeMean = _.mean(confirmationTime) / 60;
                const confirmationTimeMeanRatio = ((confirmationTimeMean/confirmationTimeMeanOthers) * 100) - 100;

                const total = unconfirmedOnes + confirmedOnes;
                const confirmedOnesRatio = (confirmedOnes/total) * 100;
                const unconfirmedOnesRatio = (unconfirmedOnes/total) * 100;
                const confirmRatio = confirmedOnes / unconfirmedOnes;
                const confirmRatioTotal = confirmedTotalCount / unconfirmedTotalCount;
                const confirmationMeanRatio = ((confirmRatio  / confirmRatioTotal) * 100) - 100;
                const addressTPS = Math.round(total / ((Date.now() - (txList[0].timestamp * 1000)) / 1000) * 100) / 100;
                const addressCTPS = Math.round(confirmedOnes / ((Date.now() - (txList[0].timestamp * 1000)) / 1000) * 100) / 100;

                sorted[index].push(total);
                sorted[index].push(`${confirmedOnes} [${confirmedOnesRatio < 100 ? confirmedOnesRatio.toFixed(1) : confirmedOnesRatio.toFixed(0)}%]`);
                sorted[index].push(`${unconfirmedOnes} [${unconfirmedOnesRatio < 100 ? unconfirmedOnesRatio.toFixed(1) : unconfirmedOnesRatio.toFixed(0)}%]`);
                sorted[index].push(confirmRatio);
                sorted[index].push(confirmationMeanRatio);
                sorted[index].push(addressTPS);
                sorted[index].push(addressCTPS);
                sorted[index].push(confirmationTimeMean);
                sorted[index].push(confirmationTimeMeanRatio);

            });

            topList = sorted;

            if(topList.length > 0) {
                createTable(topList);
            }

            /* Adapt canvas height to amount of transactions (pixel height) */
            while(c.height < timer.length * pxSize * 2 + offsetHeight + 30) {
                c.height = c.height + 50;
            }
        })
        .catch((e) => {
            console.log('Error fetching txHistory', e);
            /* This is where you run code if the server returns any errors */
        });
    }, 10000);
}
/* Init */
Main();