/*eslint no-console: ["error", { allow: ["log", "error"] }] */
/* global window, document, io, fetch, console, _ */
'use strict';

// Set environment according to current deployment
const host = window.location.hostname;
let envState = 'prod';
if (host !== 'localhost') envState = 'dev';

/* Set canvas and dimensions */
const c = document.getElementById('canvas');
const ctx = c.getContext('2d');
const tooltip = document.getElementById('tooltip');

const offsetWidth = 200;
const offsetHeight = 75;
const cWidth = c.width - offsetWidth;
const margin = 110;

const pxSize = 10;
const txPerLine = Math.ceil(cWidth / pxSize);

const textColor = '#000000';
const strokeColorNorm = '#cccccc';
const strokeColorSelect = '#ff0000';
const fontFace = 'Consolas';
const fontSizeHeader = '13px';
const fontSizeAxis = '11px';
let txAmountToPoll = 15000;
let maxTransactions = 15000;
let websocketActive = false;

const coordinator = 'KPWCHICGJZXKE9GSUDXZYUAPLHAKAHYHDXN';

const pxColorUnconf = { r: 0, g: 0, b: 0, a: 1 };
const pxColorConf = { r: 0, g: 255, b: 0, a: 1 };
const pxColorReattach = { r: 255, g: 255, b: 0, a: 1 };
const pxColorMilestone = { r: 0, g: 0, b: 255, a: 1 };
//const pxColorAvgConfTime = { r: 244, g: 65, b: 205, a: 1 };

let txList = [];
let filterForValueTX = false;
let filterForSpecificAddresses = [];
let filterAddress = '';
let manualPoll = false;
let endlessMode = false;
let selectedAddress = '';
let selectedAddressBuffer = '';
let totalConfRate = 0;
let totalConfRateEff = 0;
let totalConfirmations = [];
let milestoneMetrics = [];
let milestoneIntervalList = [];
let milestoneInterval = 0;
let totalConfirmationTime = 0;
let totalTransactions = 0;
let totalTPS = 0;
let totalCTPS = 0;
let totalTPSeff = 0;
let totalCTPSeff = 0;
let effectiveConfRateIndex = 0;

let topList = [];
let toplistAdditional = 0;
let topListCount = 15;
let toplistSortIndex = [2, 'desc'];
let toplistMinTX = 1;
let InitialHistoryPollCount = 10;

let mousePos;
let pixelMap = [];

let timer = [];
let rateLimiter = 0;
let txOfMousePosition = {};

const ChangeAddress = () => {
  selectedAddress = document.getElementById('address_input').value.substring(0, 81);
  selectedAddressBuffer = document.getElementById('address_input').value.substring(0, 81);
  //document.getElementById('status').innerHTML = `Address selection changed`;
};

document.getElementById('address_button').onclick = () => {
  ChangeAddress();
};

/* Released next
const updateMetrics = (totalTPS, totalCTPS, totalConfRate, totalConfirmationTime) => {
    document.getElementById('metric_totalTPS').innerHTML = totalTPS;
    document.getElementById('metric_totalCTPS').innerHTML = totalCTPS;
    document.getElementById('metric_totalConfRate').innerHTML = totalConfRate;
    document.getElementById('metric_totalConfirmationTime').innerHTML = totalConfirmationTime;
}
*/

const getRndInteger = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

const getRowPosition = el => {
  el = el.getBoundingClientRect();
  return {
    left: el.left + window.scrollX,
    top: el.top + window.scrollY
  };
};

/* Table creation for toplist */
const createTable = currentList => {
  /* Set minimum TX amount to be displayed */
  /*
  currentList = _.filter(currentList, n => {
    return n[2] >= toplistMinTX;
  });

  */
  currentList = _.orderBy(
    currentList,
    listItem => {
      return listItem[toplistSortIndex[0]][0];
    },
    [toplistSortIndex[1]]
  );

  const currentListLength = currentList.length;

  const mytable = document.getElementById('toplist');
  mytable.innerHTML = '';
  const tablehead = document.createElement('thead');
  const tablebody = document.createElement('tbody');
  const head_tr = document.createElement('tr');

  /* Prevent greater topListCount than actual length under any circumstance */
  /*
  if (topListCount >= currentList.length) {
    topListCount = currentList.length;
  } else if (topListCount < 0) {
    topListCount = 0;
  }
  */

  const hideSpecificAddressCheckboxWrapper = document.getElementById(
    'hideSpecificAddressCheckboxWrapper'
  );
  hideSpecificAddressCheckboxWrapper.classList.add('hide');

  if (currentList.length > 0) {
    for (let j = 0; j < currentListLength; j++) {
      const current_row = document.createElement('tr');

      current_row.addEventListener(
        'mouseenter',
        () => {
          filterAddress = current_row.getAttribute('tx');
          const listPosition = getRowPosition(current_row);

          hideSpecificAddressCheckboxWrapper.style.top = `${listPosition.top + 1}px`;
          hideSpecificAddressCheckboxWrapper.style.left = `${listPosition.left - 20}px`;

          //filterForSpecificAddresses.includes(filterAddress) ? (hideSpecificAddressCheckbox.checked = true) : (hideSpecificAddressCheckbox.checked = false);

          hideSpecificAddressCheckboxWrapper.classList.remove('hide');
        },
        false
      );

      /*
      current_row.addEventListener(
        'mouseleave',
        () => {
          document.getElementById('hideSpecificAddressCheckbox').classList.add('hide');
        },
        false
      );
      */

      for (let i = 0; i < currentList[0].length; i++) {
        const current_cell = document.createElement('td');
        current_cell.addEventListener(
          'click',
          () => {
            selectedAddress = current_cell.getAttribute('tx');
            selectedAddressBuffer = current_cell.getAttribute('tx');
            document.getElementById('address_input').value = current_cell.getAttribute('tx');
          },
          false
        );

        /* Insert table contents */
        let currenttext;

        switch (i) {
          case 0:
            currenttext = `${j + 1}`;
            break;
          case 1:
            currenttext = `${
              currentList[j][1].substring(0, 35) === coordinator
                ? '[COO]' + coordinator.substring(0, 30)
                : currentList[j][1].substring(0, 35)
            }...`;
            break;
          case 2:
            currenttext = `${currentList[j][2]} [${Math.round(
              (parseInt(currentList[j][2]) / maxTransactions) * 100
            )}%]`;
            break;
          case 3:
            currenttext = `${currentList[j][3][0]} [${
              currentList[j][3][1] < 100
                ? currentList[j][3][1].toFixed(1)
                : currentList[j][3][1].toFixed(0)
            }%]`;
            break;
          case 4:
            currenttext = `${currentList[j][4][0]} [${
              currentList[j][4][1] < 100
                ? currentList[j][4][1].toFixed(1)
                : currentList[j][4][1].toFixed(0)
            }%]`;
            break;
          case 5:
            currenttext = `${
              currentList[j][5][0] === Infinity ? 'inf.' : currentList[j][5][0].toFixed(2)
            }`;
            break;
          case 6:
            currenttext = `${
              currentList[j][6][0] === Infinity ? 'inf.' : currentList[j][6][0] > 0 ? '+' : ''
            }${currentList[j][6][0] < Infinity ? currentList[j][6][0].toFixed(0) + '%' : ''}`;
            break;
          case 7:
            currenttext = `${currentList[j][7][0].toFixed(2)}`;
            break;
          case 8:
            currenttext = `${currentList[j][8][0].toFixed(2)}`;
            break;
          case 9:
            currenttext = currentList[j][9][0] ? `${currentList[j][9][0].toFixed(1)} min` : 'n/a';
            break;
          case 10:
            currenttext = currentList[j][10][0]
              ? `${currentList[j][10][0] > 0 ? '+' : ''}${currentList[j][10][0].toFixed(1)}%`
              : 'n/a';
            break;

          default:
            currenttext = 'N/A';
        }

        const currenttextNode = document.createTextNode(currenttext);
        current_cell.appendChild(currenttextNode);

        /* TODO: switch to current_row also for address selection */
        current_cell.setAttribute('tx', currentList[j][1]);
        current_row.setAttribute('tx', currentList[j][1]);

        /* Colorize dependent of values */
        if (currentList[j][6][0] >= 0 && i == 6) {
          current_cell.setAttribute('style', 'color: #008000');
        } else if (currentList[j][6][0] < 0 && i == 6) {
          current_cell.setAttribute('style', 'color: #ff0000');
        } else if (currentList[j][10][0] >= 0 && i == 10) {
          current_cell.setAttribute('style', 'color: #ff0000');
        } else if (currentList[j][10][0] < 0 && i == 10) {
          current_cell.setAttribute('style', 'color: #008000');
        }

        current_row.appendChild(current_cell);
      }
      tablebody.appendChild(current_row);
    }

    for (let i = 0; i < currentList[0].length; i++) {
      const current_cell = document.createElement('td');
      const img = document.createElement('img');
      img.setAttribute('src', 'img/sort.png');
      img.classList.add('table_head_sortpic');

      let currenttext;

      switch (i) {
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
      if (i > 0) {
        current_cell.appendChild(img);
      }
      head_tr.appendChild(current_cell);

      /* Add listener for toplist sorting */
      current_cell.addEventListener(
        'click',
        () => {
          if (i === toplistSortIndex[0] && toplistSortIndex[1] === 'desc') {
            toplistSortIndex = [i, 'asc'];
          } else {
            toplistSortIndex = [i, 'desc'];
          }
          createTable(topList);
        },
        false
      );
    }

    tablehead.appendChild(head_tr);
    mytable.appendChild(tablehead);
    mytable.appendChild(tablebody);
  }
};

/* Collect and store mouse position for TX info at mouseover */
const GetMousePos = (c, evt) => {
  /* Calculate mouse position considering scroll position */
  if (evt.pageX == null && evt.clientX != null) {
    let doc = document.documentElement,
      body = document.body;

    evt.pageX =
      evt.clientX +
      ((doc && doc.scrollLeft) || (body && body.scrollLeft) || 0) -
      (doc.clientLeft || 0);

    evt.pageY =
      evt.clientY +
      ((doc && doc.scrollTop) || (body && body.scrollTop) || 0) -
      (doc.clientTop || 0);
  }
  /* Mouse position within canvas */
  let rect = c.getBoundingClientRect();
  return {
    x: evt.clientX - rect.left,
    y: evt.clientY - rect.top,
    xReal: evt.pageX,
    yReal: evt.pageY
  };
};

const GetTXofMousePosition = mousePosition => {
  mousePosition.y = mousePosition.y - offsetHeight;
  mousePosition.x = mousePosition.x - margin;
  const txAtMouse = pixelMap.reduce((acc, tx) => {
    if (
      mousePosition.x >= tx.x &&
      mousePosition.x < tx.x + pxSize &&
      mousePosition.y >= tx.y &&
      mousePosition.y < tx.y + pxSize
    ) {
      acc = tx;
    }
    return acc;
  }, 0);
  return txAtMouse;
};

const OpenLink = tx => {
  if (tx) {
    window.open(`https://thetangle.org/address/${tx}`);
  }
  if (txOfMousePosition.hash) {
    window.open(`https://thetangle.org/transaction/${txOfMousePosition.hash}`);
  }
};

/*
Listen to mousemove and search for TX at position of mousecursor
Arbitrary rate limitation of function calls for performance reasons
Kind of workaround to not need a dedicated element for each TX pixel which floods the DOM
*/
c.addEventListener(
  'mousemove',
  evt => {
    const now = Date.now();
    if (now - rateLimiter > 25) {
      mousePos = GetMousePos(c, evt);
      txOfMousePosition = GetTXofMousePosition(mousePos);

      if (txOfMousePosition.hash) {
        let txConfirmationTime = _.round(
          (txOfMousePosition.ctime - txOfMousePosition.receivedAt) / 1000 / 60,
          2
        );

        if (txOfMousePosition.confirmed) {
          txConfirmationTime = `${txConfirmationTime} Minutes`;
        } else if (txOfMousePosition.reattached) {
          txConfirmationTime = 'Reattached transaction';
        } else {
          txConfirmationTime = 'Not confirmed yet';
        }

        tooltip.innerHTML = `Address:\u00A0${txOfMousePosition.address}<br>
                                TX Hash:\u00A0${txOfMousePosition.hash}<br>
                                Bundle:\u00A0\u00A0${txOfMousePosition.bundle}<br>
                                Tag:\u00A0\u00A0\u00A0\u00A0\u00A0${txOfMousePosition.tag}<br>
                                C. Time:\u00A0${txConfirmationTime}<br>
                                Value:\u00A0\u00A0\u00A0${
                                  txOfMousePosition.value !== 0
                                    ? Math.round((txOfMousePosition.value / 1000000) * 100) / 100 +
                                      ' MIOTA'
                                    : 'Zero value transaction'
                                }`;
        selectedAddress = txOfMousePosition.address;
        tooltip.style.display = 'block';
        tooltip.style.top = `${mousePos.yReal + 15}px`;
        tooltip.style.left = `${mousePos.xReal + 15}px`;
        document.body.style.cursor = 'pointer';
      } else {
        tooltip.style.display = 'none';
        document.body.style.cursor = 'auto';
        txOfMousePosition = {};
        selectedAddress = '';
      }
      rateLimiter = Date.now();
    }
  },
  false
);

c.addEventListener(
  'mouseout',
  () => {
    tooltip.style.display = 'none';
    document.body.style.cursor = 'auto';
    txOfMousePosition = {};
    selectedAddress = selectedAddressBuffer;
  },
  false
);

/* Net selector event listener */
const netselector = document.getElementById('netselector');
const netSwitch = () => {
  window.location.replace(
    `https://${netselector.value === 'mainnet' ? 'www' : netselector.value}.tanglemonitor.com`
  );
};

netselector.addEventListener('change', netSwitch);

/* Reset address selection */
document.getElementById('address_button_reset').addEventListener(
  'click',
  () => {
    selectedAddress = '';
    selectedAddressBuffer = '';
    document.getElementById('address_input').value = '';
  },
  false
);

/* Switch for filtering zero value TX */
const checkBoxZero = document.getElementById('hideZero');
document.getElementById('hideZero').addEventListener(
  'click',
  () => {
    if (checkBoxZero.checked === true) {
      filterForValueTX = true;
      txList = FilterZeroValue(txList);
      CalcToplist(false);
    } else {
      filterForValueTX = false;
      InitialHistoryPoll(false);
      CalcToplist(false);
    }
  },
  false
);

/* Switch for filtering specific addresses */
//const hideSpecificAddressCheckboxWrapper = document.getElementById('hideSpecificAddressCheckboxWrapper');
document.getElementById('hideSpecificAddressCheckboxWrapper').addEventListener(
  'click',
  () => {
    filterForSpecificAddresses.push(filterAddress);
    txList = FilterSpecificAddresses(txList);
    CalcToplist(false);
    /*
    Alternative solution with switch

    if (hideSpecificAddressCheckboxWrapper.checked === true) {
      filterForSpecificAddresses.push(filterAddress);
      txList = FilterSpecificAddresses(txList);
      CalcToplist(false);
    } else {
      filterForSpecificAddresses = filterForSpecificAddresses.filter(addr => addr !== filterAddress);

      InitialHistoryPoll(false);
      CalcToplist(false);
    }
    */
  },
  false
);

/* Switch for endless TX mode */
let maxTransactionsBuffer = maxTransactions;

const checkBoxEndless = document.getElementById('endlessMode');
document.getElementById('endlessMode').addEventListener(
  'click',
  () => {
    if (checkBoxEndless.checked === true) {
      endlessMode = true;
      maxTransactionsBuffer = maxTransactions;
      maxTransactions = 10000000000000;
    } else {
      endlessMode = false;
      maxTransactions = maxTransactionsBuffer;
    }
  },
  false
);

/* Uncheck on load */
checkBoxZero.checked = false;
checkBoxEndless.checked = false;

/* Additional event listeners */
c.addEventListener(
  'click',
  () => {
    OpenLink(false);
  },
  false
);

/* Toplist menu triggers */
document.getElementById('toplist-more').addEventListener(
  'click',
  () => {
    toplistAdditional = toplistAdditional + 5;
    CalcToplist(false);
  },
  false
);

document.getElementById('toplist-all').addEventListener(
  'click',
  () => {
    toplistAdditional = 10000;
    CalcToplist(false);
  },
  false
);

document.getElementById('toplist-reset').addEventListener(
  'click',
  () => {
    topListCount = 15;
    toplistAdditional = 0;
    CalcToplist(false);
  },
  false
);

/* Set minimum TX to display in toplist */
document.getElementById('minNumberOfTxIncluded_button').addEventListener(
  'click',
  () => {
    toplistMinTX = parseInt(document.getElementById('minNumberOfTxIncluded').value);
    CalcToplist(false);
  },
  false
);

/* Set amount of TX to poll from server */
document.getElementById('txToPollWrapper_button').addEventListener(
  'click',
  () => {
    txAmountToPoll = parseInt(document.getElementById('txToPoll').value);
    document.getElementById('loadingTX').classList.remove('hide');
    document.getElementById('loadingTX').classList.add('inline_block');
    manualPoll = true;
    maxTransactions = txAmountToPoll;
    InitialHistoryPoll(false);
  },
  false
);

/* Get current line position */
const calcLineCount = (i, pxSize, cWidth) => {
  const lines = Math.floor((i * pxSize) / cWidth);
  return lines;
};

/* Update conf and milestone status on local DB */
const UpdateTXStatus = (update, updateType) => {
  const txHash = update.hash;
  const milestoneType = update.milestone;
  const confirmationTime = update.ctime;

  const hashIndex = txList.findIndex(tx => tx.hash === txHash);
  if (hashIndex !== -1 && txList[hashIndex] !== undefined) {
    if (updateType === 'txConfirmed' || updateType === 'Milestone') {
      txList[hashIndex].ctime = confirmationTime;
      txList[hashIndex].confirmed = true;
    }
    if (updateType === 'Milestone') {
      txList[hashIndex].milestone = milestoneType;
    }
    if (updateType === 'Reattach') {
      txList[hashIndex].reattached = true;
    }
  } else {
    console.log(
      `${
        updateType === 'Milestone' ? 'Milestone' : 'TX'
      } not found in local DB - Hash: ${txHash} | updateType: ${updateType}`
    );
  }
};

/* Draw canvas iteration */
const DrawCanvas = txList_DrawCanvas => {
  /* Clear screen on each tick */
  ctx.clearRect(0, 0, cWidth + offsetWidth, c.height);

  /* Adapt canvas height to amount of transactions (pixel height) */
  while (c.height < timer.length * pxSize * 2 + offsetHeight + 30) {
    c.height = c.height + 50;
  }

  /* Create array of transaction pixels including respective confirmation status */
  let pxls = [];
  txList_DrawCanvas.map((tx, i) => {
    const lineCount = calcLineCount(i, pxSize, cWidth);
    pxls.push({
      x: i * pxSize - lineCount * pxSize * txPerLine,
      y: lineCount * pxSize,
      hash: tx.hash,
      bundle: tx.bundle,
      address: tx.address,
      value: tx.value,
      tag: tx.tag,
      confirmed: tx.confirmed,
      reattached: tx.reattached,
      receivedAt: tx.receivedAt,
      //receivedAtms: tx.receivedAtms,
      //timestamp: tx.timestamp,
      ctime: tx.ctime,
      milestone: tx.milestone
    });
  });

  /* Store current pixelmap in global variable for local TX polling */
  pixelMap = pxls;

  /* Create header metrics and legend labels */
  ctx.font = `${fontSizeHeader} ${fontFace}`;
  ctx.fillStyle = textColor;
  ctx.textBaseline = 'hanging';
  ctx.textAlign = 'left';

  ctx.fillText('Total TX count        ' + totalTransactions, margin + 10, 10);
  ctx.fillText('Avg. TPS              ' + totalTPS, margin + 10, 25);
  ctx.fillText('Avg. conf.ratio       ' + totalConfRate + ' %', margin + 10, 40);
  ctx.fillText('Avg. eff. conf.ratio  ' + totalConfRateEff + ' %', margin + 10, 55);

  ctx.fillText('Avg. conf. time   ' + totalConfirmationTime + ' min', margin + 240, 10);
  ctx.fillText('Avg. CTPS         ' + totalCTPS, margin + 240, 25);
  ctx.fillText('Avg. MS interval  ' + milestoneInterval + ' min', margin + 240, 40);

  ctx.fillText('Unconfirmed', cWidth - 60, 10);
  ctx.fillText('Confirmed', cWidth - 60, 25);
  ctx.fillText('Reattached', cWidth + 40, 10);
  ctx.fillText('Milestone', cWidth + 40, 25);
  ctx.fillText('Avg.conf.time indicator', cWidth - 60 + 5, 40);

  ctx.fillStyle = 'rgba(0,0,0,1)';
  ctx.fillRect(cWidth - 75, 10, pxSize, pxSize);
  ctx.fillStyle = 'rgba(0,255,0,1)';
  ctx.fillRect(cWidth - 75, 25, pxSize, pxSize);
  ctx.fillStyle = 'rgba(255,255,0,1)';
  ctx.fillRect(cWidth + 25, 10, pxSize, pxSize);
  ctx.fillStyle = 'rgba(0,0,255,1)';
  ctx.fillRect(cWidth + 25, 25, pxSize, pxSize);
  ctx.fillStyle = 'rgba(244,65,205,1)';
  ctx.fillRect(cWidth - 75, 40 + 5, 15, 3);

  /*  Draw TX pixels and additional metrics */
  pxls.map((px, pixelIndex) => {
    /* Set default stroke offset */
    let strokeOffset = 0;

    /* Declare amount of TX for calculation of TPS / confirmation rate metrics */
    const confRateRange = txPerLine * 2;
    if (pixelIndex % confRateRange == 0) {
      const step = pixelIndex / confRateRange;

      ctx.font = `${fontSizeAxis} ${fontFace}`;
      ctx.fillStyle = textColor;
      ctx.textBaseline = 'hanging';
      ctx.textAlign = 'right';

      /* Calc current TPS and display appropriately */
      const confRateRangeList = txList.slice(
        step * confRateRange,
        step * confRateRange + confRateRange
      );
      //let reattachments = 0;
      const totalRangeTxAmount = confRateRangeList.length;
      const confirmedRangeTxAmount = confRateRangeList.filter(tx => {
        //if(tx.reattached){reattachments++}
        return tx.confirmed !== false;
      }).length;

      const unconfirmedRangeTxAmount = totalRangeTxAmount - confirmedRangeTxAmount;
      const confRate = Math.round(
        (confirmedRangeTxAmount / (confirmedRangeTxAmount + unconfirmedRangeTxAmount)) * 100
      );

      const tps =
        Math.round(((txPerLine * 2) / (timer[step + 1] / 1000 - timer[step] / 1000)) * 10) / 10;

      ctx.fillText(
        (isNaN(confRate) ? '0' : confRate) +
          '%' +
          (isNaN(tps) ? ' [...]' : ' [' + tps.toFixed(1) + ' TPS]'),
        margin - 5,
        px.y + offsetHeight + 5
      );
    }

    /* Adapt TX color to confirmation or milestone status */
    let pxColor = pxColorUnconf;
    let strokeCol = strokeColorNorm;

    if (px.confirmed === false || px.confirmed === undefined) {
      pxColor = pxColorUnconf;
      strokeCol = strokeColorNorm;
      pxColor.a = 1;
    }

    if (px.milestone === 'f' && px.reattached === true) {
      //px.confirmed === false && ..
      pxColor = pxColorReattach;
      strokeCol = strokeColorNorm;
      pxColor.a = 1;
    }

    if (px.confirmed === true && px.milestone === 'f') {
      pxColor = pxColorConf;
      strokeCol = strokeColorNorm;
      pxColor.a = 1;
    }

    if (px.milestone === 'm') {
      ctx.fillStyle = 'rgba(255, 255, 255, 1)';
      ctx.fillRect(margin + cWidth + 5, px.y + offsetHeight, 100, pxSize);

      ctx.font = `${fontSizeAxis} ${fontFace}`;
      ctx.fillStyle = textColor;
      ctx.textBaseline = 'hanging';
      ctx.textAlign = 'left';

      pxColor = pxColorMilestone;
      strokeCol = strokeColorNorm;
      const minElapsed = Math.floor((parseInt(Date.now()) - px.receivedAt) / 1000 / 60);
      ctx.fillText(`${minElapsed} min`, margin + cWidth + 5, px.y + offsetHeight);

      pxColor.a = 1;
    }

    if (px.milestone === 't') {
      pxColor = pxColorMilestone;
      strokeCol = strokeColorNorm;
      pxColor.a = 1;
    }

    if (px.address === selectedAddress) {
      strokeCol = strokeColorSelect;
      strokeOffset = 1;
      pxColor.a = 1;
    }

    if (pixelIndex === effectiveConfRateIndex) {
      /*
      strokeCol = strokeColorNorm;
      pxColor = pxColorAvgConfTime;
      strokeOffset = 1;
      */
      ctx.fillStyle = 'rgba(' + 244 + ',' + 65 + ',' + 205 + ',' + 1 + ')';
      ctx.fillRect(margin + cWidth + 5, px.y + offsetHeight - 1, 15, 3);
    }
    /* Display actual TX pixel */
    ctx.fillStyle = 'rgba(' + pxColor.r + ',' + pxColor.g + ',' + pxColor.b + ',' + pxColor.a + ')';
    ctx.fillRect(px.x + margin, px.y + offsetHeight, pxSize, pxSize);
    ctx.strokeStyle = strokeCol;
    ctx.lineWidth = 1;
    ctx.strokeRect(
      px.x + margin,
      px.y + offsetHeight,
      pxSize - strokeOffset,
      pxSize - strokeOffset
    );
  });
  window.setTimeout(() => DrawCanvas(txList), 250);
};

const CalcToplist = initial => {
  topListCount = topListCount + toplistAdditional;

  // Track total TX confirmations and non-confirmations
  let confirmedTotalCount = 0;
  let unconfirmedTotalCount = 0;
  // Track address TX confirmations and non-confirmations + confirmation time
  let metricsPerAddress = {};
  // Track total average confirmation time
  let totalAverageCtime = [];
  // Iterate over whole TX database and gather data
  txList.map(tx => {
    // ctime & receivedAt are timestamps
    const ctimeDelta = tx.ctime - tx.receivedAt;
    if (tx.confirmed) totalAverageCtime.push(ctimeDelta);
    // If address was not iterated over yet, set Object for first time
    if (!metricsPerAddress[tx.address]) {
      // c: track confirmed ones
      // u: track unconfirmed ones
      // t: track unconfirmed + confirmed ones (total)
      // ct: track confirmation time
      metricsPerAddress[tx.address] = {
        c: tx.confirmed ? 1 : 0,
        u: tx.confirmed ? 0 : 1,
        t: 1,
        ct: tx.confirmed ? [ctimeDelta] : []
      };
      // Otherwise increment values for given address
    } else {
      const confirmed = metricsPerAddress[tx.address].c;
      const unconfirmed = metricsPerAddress[tx.address].u;
      const total = metricsPerAddress[tx.address].t;

      metricsPerAddress[tx.address].t = total + 1;

      if (tx.confirmed) {
        metricsPerAddress[tx.address].c = confirmed + 1;
        metricsPerAddress[tx.address].ct.push(ctimeDelta);
      } else {
        metricsPerAddress[tx.address].u = unconfirmed + 1;
      }
    }
  });

  // Transform object into list
  metricsPerAddress = Object.entries(metricsPerAddress);

  // If toplistMinTX over 1 was set by user, filter accordingly
  if (toplistMinTX > 1) {
    metricsPerAddress = _.filter(metricsPerAddress, address => {
      return address[1].t >= toplistMinTX;
    });
  }

  // Order by total transactions
  metricsPerAddress = _.orderBy(
    metricsPerAddress,
    listItem => {
      return listItem[1].t;
    },
    [toplistSortIndex[1]]
  );

  // Prune to the amount of addresses to be listed
  metricsPerAddress = metricsPerAddress.slice(0, topListCount);

  let testList = [];

  const confirmationTimeMeanTotal = _.mean(totalAverageCtime) / 1000 / 60;

  metricsPerAddress.map(tx => {
    const txAddress = tx[0];

    const unconfirmedOnes = tx[1].u;
    const confirmedOnes = tx[1].c;

    confirmedTotalCount += confirmedOnes;
    unconfirmedTotalCount += unconfirmedOnes;

    const confirmationTime = tx[1].ct;
    const total = tx[1].t;
    //const confirmationTimeOthers = totalAverageCtime;

    //const confirmationTimeMeanTotal = _.mean(confirmationTimeOthers) / 1000 / 60;
    const confirmationTimeMean = _.mean(confirmationTime) / 1000 / 60;
    const confirmationTimeMeanRatio =
      (confirmationTimeMean / confirmationTimeMeanTotal) * 100 - 100;

    //const total = unconfirmedOnes + confirmedOnes;
    const confirmedOnesRatio = (confirmedOnes / total) * 100;
    const unconfirmedOnesRatio = (unconfirmedOnes / total) * 100;
    const confirmRatio = confirmedOnes / total; //former: confirmedOnes / unconfirmedOnes
    const confirmRatioTotal = confirmedTotalCount / (confirmedTotalCount + unconfirmedTotalCount);
    const confirmationMeanRatio = (confirmRatio / confirmRatioTotal) * 100 - 100;
    const addressTPS =
      Math.round((total / ((Date.now() - txList[0].receivedAt) / 1000)) * 100) / 100;
    const addressCTPS =
      Math.round((confirmedOnes / ((Date.now() - txList[0].receivedAt) / 1000)) * 100) / 100;

    testList.push([
      [0],
      txAddress,
      [total],
      [confirmedOnes, confirmedOnesRatio],
      [unconfirmedOnes, unconfirmedOnesRatio],
      [confirmRatio],
      [confirmationMeanRatio],
      [addressTPS],
      [addressCTPS],
      [confirmationTimeMean],
      [confirmationTimeMeanRatio]
    ]);
  });

  topList = testList;

  if (testList.length > 0) {
    createTable(testList);
  }
  //}

  if (initial) {
    window.setTimeout(() => CalcToplist(true), 30 * 1000);
  }
};

const CalcMetricsSummary = () => {
  orderTxList();
  const now = Date.now();
  /* Reset milestone interval buffer */
  milestoneMetrics = [];
  milestoneIntervalList = [];

  /* Calculate metrics */
  totalTransactions = txList.length;
  // Restrict max TX to display
  if (totalTransactions >= maxTransactions) {
    const multiplicator = Math.floor(totalTransactions / maxTransactions);
    txList.splice(0, txPerLine * multiplicator);
  }
  /* Do this on every 100 or x amount of TX */
  let timerTemp = [];
  txList.map((tx, txNumber) => {
    if (txNumber % (txPerLine * 2) === 0) {
      timerTemp.push(tx.receivedAt);
    }
  });
  timer = timerTemp;

  /* Calculate average confirmation time of all confirmed TX */
  const totalConfirmationTimeMs = _.meanBy(totalConfirmations, confTimes => {
    if (confTimes.milestone === false) {
      return confTimes.ctime;
    }
  });
  totalConfirmationTime = _.round(totalConfirmationTimeMs / 1000 / 60, 1);

  //let reattachCounter = 0;
  totalConfirmations = txList.reduce((acc, tx) => {
    /* Accumulate reattaches */
    /*
            if(tx.reattached === true){
                reattachCounter++;
            }
            */
    /* Accumulate confirmed TX with confirmation time */
    if (tx.confirmed === true) {
      acc.push({
        ctime: tx.ctime - tx.receivedAt,
        milestone: tx.milestone === 'f' ? false : true,
        effective: tx.receivedAt > now - totalConfirmationTimeMs ? false : true
      });

      if (tx.milestone === 'm') {
        milestoneMetrics.push(tx.receivedAt);
      }
    }
    return acc;
  }, []);

  const totalConfirmationsCountEff = _.countBy(totalConfirmations, 'effective').true;

  milestoneMetrics.map((milestone, iter) => {
    if (iter > 0) {
      milestoneIntervalList.push(milestone - milestoneMetrics[iter - 1]);
    }
  });

  milestoneInterval = Math.round((_.mean(milestoneIntervalList) / 1000 / 60) * 10) / 10;

  const totalConfirmationsCount = totalConfirmations.length;
  const totalUnconfirmedCount = totalTransactions - totalConfirmationsCount;

  /* Calculate (effective) confirmation rate of all confirmed TX, excluding reattaches */
  totalConfRate =
    Math.round(
      (totalConfirmationsCount / (totalConfirmationsCount + totalUnconfirmedCount)) * 10000
    ) / 100;

  effectiveConfRateIndex = _.findIndex(txList, o => {
    return o.receivedAt > now - totalConfirmationTimeMs;
  });

  if (totalTransactions > 0) {
    totalTPS = Math.round((totalTransactions / ((now - txList[0].receivedAt) / 1000)) * 100) / 100;
    totalCTPS =
      Math.round((totalConfirmationsCount / ((now - txList[0].receivedAt) / 1000)) * 100) / 100;

    if (txList[effectiveConfRateIndex] && txList[effectiveConfRateIndex].receivedAt) {
      totalTPSeff =
        Math.round(
          (effectiveConfRateIndex / ((now - txList[effectiveConfRateIndex].receivedAt) / 1000)) *
            100
        ) / 100;
      totalCTPSeff =
        Math.round(
          (totalConfirmationsCountEff /
            ((now - txList[effectiveConfRateIndex].receivedAt) / 1000)) *
            100
        ) / 100;
      totalConfRateEff = Math.round((totalCTPSeff / totalTPSeff) * 10000) / 100;
      //console.log(totalCTPS / totalTPS, effectiveConfRateIndex, totalCTPSeff / totalTPSeff, totalConfRateEff);
    }
  }

  /* Adapt maxTransactions to TPS */
  if (totalTPS > 20 && !endlessMode && !manualPoll) {
    maxTransactions = 30000;
  } else if (totalTPS <= 20 && !endlessMode && !manualPoll) {
    maxTransactions = 15000;
  }
  //updateMetrics(totalTPS, totalCTPS, totalConfRate, totalConfirmationTime);
  window.setTimeout(() => CalcMetricsSummary(), 1500);
};

/* Fetch recent TX history */
const InitialHistoryPoll = firstLoad => {
  let pollingURL = '';
  envState === 'prod'
    ? (pollingURL = `https://tanglemonitor.com:4433/api/v1/getRecentTransactions?amount=${txAmountToPoll}`)
    : (pollingURL = `http://localhost:8080/api/v1/getRecentTransactions?amount=${txAmountToPoll}`);

  /* Fetch current tangle TX from remote backend */
  fetch(pollingURL, { cache: 'no-cache' })
    .then(json_test => json_test.json())
    .then(response => {
      document.getElementById('loading').style.display = 'none';
      document.getElementById('loadingTX').classList.add('hide');
      document.getElementById('loadingTX').classList.remove('inline_block');
      /* Filter if switch for only value TX is set */
      if (filterForValueTX) {
        response.txHistory = FilterZeroValue(response.txHistory);
      }

      if (filterForSpecificAddresses.length > 0) {
        response.txHistory = FilterSpecificAddresses(response.txHistory);
      }

      txList = response.txHistory;
      CalcMetricsSummary();
      if (firstLoad) {
        CalcToplist(true);
      }

      /* After polling of history is finished init websocket (on first load) */
      if (firstLoad && !websocketActive) {
        InitWebSocket();
      } else if (websocketActive) {
        console.log('WebSocket already initialized');
      }
    })
    .catch(e => {
      console.error('Error fetching txHistory', e);
      if (InitialHistoryPollCount > 0) {
        window.setTimeout(() => InitialHistoryPoll(firstLoad), 2500);
        InitialHistoryPollCount--;
      }
    });
};

const orderTxList = () => {
  txList = _.orderBy(txList, ['receivedAt'], ['asc']);
};

// Init Websocket for client
const InitWebSocket = () => {
  if (!websocketActive) {
    websocketActive = true;
    let socketURL = '';
    envState === 'prod'
      ? (socketURL = 'https://tanglemonitor.com:4434')
      : (socketURL = 'http://localhost:8081');
    let sslState = true;
    envState === 'prod' ? (sslState = true) : (sslState = false);

    const socket = io.connect(
      socketURL,
      { secure: sslState, reconnection: false }
    );

    socket.on('connect', () => {
      console.log(`Successfully connected to Websocket.. [websocketActive: ${websocketActive}]`);

      socket.on('newTX', newTX => {
        let filterCriteria = [true];

        if (filterForValueTX && newTX.value !== 0) {
          filterCriteria.push(true);
        } else if (!filterForValueTX) {
          filterCriteria.push(true);
        } else {
          filterCriteria.push(false);
        }

        if (filterForSpecificAddresses.length > 0) {
          /* Find solution for several addresses */
          if (filterForSpecificAddresses.includes(newTX.address)) {
            filterCriteria.push(false);
          } else {
            filterCriteria.push(true);
          }
        }

        if (!filterCriteria.includes(false)) {
          //console.log(newTX);
          /*
          Set timestamp on client locally
          newTX.receivedAtms = parseInt(Date.now());
          */
          txList.push(newTX);
        }
      });
      socket.on('update', update => {
        UpdateTXStatus(update, 'txConfirmed');
      });
      socket.on('updateMilestone', updateMilestone => {
        UpdateTXStatus(updateMilestone, 'Milestone');
      });
      socket.on('updateReattach', updateReattach => {
        UpdateTXStatus(updateReattach, 'Reattach');
      });

      socket.on('disconnect', reason => {
        console.log(`WebSocket disconnect [${reason}]`);
        websocketActive = false;
        socket.close();

        window.setTimeout(() => {
          InitWebSocket();
          console.log('WebSocket reconnecting...');
        }, getRndInteger(100, 1000));
      });

      socket.on('reconnect', attemptNumber => {
        console.log(`WebSocket reconnect [${attemptNumber}]`);
      });

      socket.on('reconnect_error', error => {
        console.log(`WebSocket reconnect_error [${error}]`);
        websocketActive = false;
        window.setTimeout(() => {
          InitWebSocket();
        }, getRndInteger(10, 100));
      });

      socket.on('connect_timeout', timeout => {
        console.log(`WebSocket connect_timeout [${timeout}]`);
        websocketActive = false;
        window.setTimeout(() => {
          InitWebSocket();
        }, getRndInteger(10, 100));
      });

      socket.on('error', error => {
        console.log(`WebSocket error [${error}]`);
      });

      socket.on('connect_error', error => {
        console.log(`WebSocket connect_error [${error}]`);
        websocketActive = false;
        window.setTimeout(() => {
          InitWebSocket();
        }, getRndInteger(10, 100));
      });

      // Ensure socket gets closed before exiting the session
      window.addEventListener('beforeunload', () => {
        socket.close();
      });
    });
  }
};

const FilterZeroValue = theList => {
  const filteredList = _.filter(theList, filterValue => {
    return filterValue.value !== 0 || filterValue.milestone === 'm';
  });
  return filteredList;
};

const FilterSpecificAddresses = theList => {
  const filteredList = _.filter(theList, filterValue => {
    return !filterForSpecificAddresses.includes(filterValue.address);
  });
  return filteredList;
};

const Main = () => {
  /* Render canvas */
  DrawCanvas(txList);
  /* Fetch history initialy */
  InitialHistoryPoll(true);
};
/* Init */
Main();
