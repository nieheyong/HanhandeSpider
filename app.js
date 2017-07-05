'use strict'
let fs = require("fs");
let cheerio = require('cheerio');
let asyncQuene = require("async").queue;
let request = require('superagent');
require('superagent-charset')(request);

const Config = {
    startPage: 1, //开始页码
    endPage: 1, //结束页码，不能大于当前图片类型总页码
    downloadImg: true, //是否下载图片到硬盘,否则只保存Json信息到文件
    downloadConcurrent: 10, //下载图片最大并发数
    currentImgType: "scy" //当前程序要爬取得图片类型,取下面AllImgType的Key。
};

const AllImgType = { //网站的图片类型
    ecy: "http://tu.hanhande.com/ecy/ecy_", //二次元   总页码: 50
    scy: "http://tu.hanhande.com/scy/scy_", //三次元   总页码: 64
    cos: "http://tu.hanhande.com/cos/cos_", //cosPlay 总页码: 20
};

let getHtmlAsync = function (url) {
    return new Promise(function (resolve, reject) {
        request.get(url).charset('gbk').end(function (err, res) {
            err ? reject(err) : resolve(cheerio.load(res.text));
        });
    });
}

let getAlbumsAsync = function () {
    return new Promise(function (resolve, reject) {
        console.log('Start get albums .....');
        let albums = [];
        let q = asyncQuene(async function (url, taskDone) {
            try {
                let $ = await getHtmlAsync(url);
                console.log(`download ${url} success`);
                $('.picList em a').each(function (idx, element) {
                    albums.push({
                        title: element.children[1].attribs.alt,
                        url: element.attribs.href,
                        imgList: []
                    });
                });
            } catch (err) {
                console.log(`Error : get Album list - download ${url} err : ${err}`);
            }
            finally {
                taskDone();// 一次任务结束
            }
        }, 10);//html下载并发数设为10
        /**
         * 监听：当所有任务都执行完以后，将调用该函数
         */
        q.drain = function () {
            console.log('Get album list complete');
            resolve(albums);//返回所有画册
        }

        let pageUrls = [];
        let imageTypeUrl = AllImgType[Config.currentImgType];
        for (let i = Config.startPage; i <= Config.endPage; i++) {
            pageUrls.push(imageTypeUrl + `${i}.shtml`);
        }
        q.push(pageUrls);
    }
    );
}

let getImageListAsync = function (albumsList) {
    return new Promise(function (resolve, reject) {
        console.log('Start get album`s imgList ....');
        let q = asyncQuene(async function ({ url: albumUrl, title: albumTitle, imgList }, taskDone) {
            try {
                let $ = await getHtmlAsync(albumUrl);
                console.log(`get album ${albumTitle} image list done`);
                $('#picLists img').each(function (idx, element) {
                    imgList.push(element.attribs.src);
                });
            } catch (err) {
                console.log(`Error :get image list - download ${albumUrl} err : ${err}`);
            }
            finally {
                taskDone();// 一次任务结束
            }
        }, 10);//html下载并发数设为10
        /**
         * 监听：当所有任务都执行完以后，将调用该函数
         */
        q.drain = function () {
            console.log('Get image list complete');
            resolve(albumsList);
        }

        //将所有任务加入队列
        q.push(albumsList);
    });
}

function writeJsonToFile(albumList) {
    let folder = `json-${Config.currentImgType}-${Config.startPage}-${Config.endPage}`
    fs.mkdirSync(folder);
    let filePath = `./${folder}/${Config.currentImgType}-${Config.startPage}-${Config.endPage}.json`;
    fs.writeFileSync(filePath, JSON.stringify(albumList));
}

function downloadImg(albumList) {
    console.log('Start download album`s image ....');
    const folder = `img-${Config.currentImgType}-${Config.startPage}-${Config.endPage}`;
    fs.mkdirSync(folder);
    let downloadCount = 0;
    let q = asyncQuene(async function ({ title: albumTile, url: imageUrl }, taskDone) {
        request.get(imageUrl).end(function (err, res) {
            if (err) {
                console.log(err);
                taskDone();
            } else {
                fs.writeFile(`./${folder}/${albumTile}-${++downloadCount}.jpg`, res.body, function (err) {
                    err ? console.log(err) : console.log(`${albumTile}保存一张`);
                    taskDone();
                });
            }
        });
    }, Config.downloadConcurrent);
    /**
     * 监听：当所有任务都执行完以后，将调用该函数
     */
    q.drain = function () {
        console.log('All img download');
    }

    let imgListTemp = [];
    albumList.forEach(function ({ title, imgList }) {
        imgList.forEach(function (url) {
            imgListTemp.push({ title: title, url: url });
        });
    });
    q.push(imgListTemp);//将所有任务加入队列
}

async function spiderRun() {
    let albumList = await getAlbumsAsync();//获取所有画册URL
    albumList = await getImageListAsync(albumList);//根据画册URL获取画册里的所有图片URL
    writeJsonToFile(albumList);//将画册信息保存为JSON
    if (Config.downloadImg) {
        downloadImg(albumList);//下载画册里面的所有图片
    }
}

spiderRun();
