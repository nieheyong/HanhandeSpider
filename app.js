'use strict'
let fs = require("fs");
let cheerio = require('cheerio');
let async = require("async");
let request = require('superagent');
require('superagent-charset')(request);

const Config = {
    startPage: 1, //开始页码
    endPage: 1, //结束页码，不能大于当前图片类型总页码
    downloadImg: true, //是否下载图片到硬盘
    downloadConcurrent: 10, //下载图片最大并发数
    currentImgType: "scy" //当前程序要爬取得图片类型,取下面AllImgType的Key。
};

const AllImgType = { //网站的图片类型
    ecy: "http://tu.hanhande.com/ecy/ecy_", //二次元   总页码: 50
    scy: "http://tu.hanhande.com/scy/scy_", //三次元   总页码: 64
    cos: "http://tu.hanhande.com/cos/cos_", //cosPlay 总页码: 20
};

let getAlbumsAsync = function () {
    return new Promise(function (resolve, reject) {
        console.log('Start get albums .....');
        let albums = [];
        let q = async.queue(function (url, callback) {
            request.get(url).charset('gbk')
                .end(function (err, res) {
                    if (err) {
                        console.log('err: ' + err);
                    } else {
                        let $ = cheerio.load(res.text);
                        $('.picList em a').each(function (idx, element) {
                            albums.push({
                                title: element.children[1].attribs.alt,
                                url: element.attribs.href,
                                imgList: []
                            });
                        });
                    }
                    callback();
                });
        }, 10);//html下载并发数设为10
        /**
         * 监听：当所有任务都执行完以后，将调用该函数
         */
        q.drain = function () {
            console.log('Get album complete');
            //返回所有画册
            resolve(albums);
        }

        let pageUrls = [];
        let imageTypeUrl = AllImgType[Config.currentImgType];
        for (let i = Config.startPage; i <= Config.endPage; i++) {
            pageUrls.push(imageTypeUrl + i + '.shtml');
        }
        q.push(pageUrls);
    }
    );
}
let getImageListAsync = function (albumsList) {
    return new Promise(function (resolve, reject) {
        console.log('Start get album`s imgList ....');
        let q = async.queue(function (album, callback) {
            console.log('Get image list : ' + album.title);
            request.get(album.url).charset('gbk')
                .end(function (err, res) {
                    if (err) {
                        console.log('err: ' + err);
                    } else {
                        let $ = cheerio.load(res.text);
                        $('#picLists img').each(function (idx, element) {
                            album.imgList.push(element.attribs.src);
                        });
                    }
                    callback();
                });
        }, 10);//html下载并发数设为10
        /**
         * 监听：当所有任务都执行完以后，将调用该函数
         */
        q.drain = function () {
            resolve(albumsList);
        }

        //将所有任务加入队列
        q.push(albumsList);
    });
}

function writeJsonToFile(albumList) {
    let folder = `Data/json-${Config.currentImgType}-${Config.startPage}-${Config.endPage}`
    fs.mkdirSync(folder);
    let filePath = `./${folder}/${Config.currentImgType}-${Config.startPage}-${Config.endPage}.json`;
    fs.writeFile(filePath, JSON.stringify(albumList), function (err) {
        if (err)
            console.log(err);
    });

    let simpleAlbums = [];
    // "http://www.hanhande.com/upload/170103/4182591_102225_1063.jpg"
    const slice = "http://www.hanhande.com/upload/".length;
    albumList.forEach(function (album) {
        let imgList = [];
        album.imgList.forEach(function (url) {
            imgList.push(url.slice(slice))
        })
        simpleAlbums.push({ title: album.title, url: album.url, imgList: imgList })
    });
    filePath = `./${folder}/${Config.currentImgType}-${Config.startPage}-${Config.endPage}.min.json`;
    fs.writeFile(filePath, JSON.stringify(simpleAlbums), function (err) {
        if (err)
            console.log(err);
    });
}

function downloadImg(albumList) {
    console.log('Start get album`s imgList ....');
    let folder = `Data/img-${Config.currentImgType}-${Config.startPage}-${Config.endPage}`;
    fs.mkdirSync(folder);
    let downloadCount = 0;
    let q = async.queue(function (image, callback) {
        console.log('正在下载 : ' + image.title);
        request.get(image.url).end(function (err, res) {
            if (err) {
                console.log(err);
                callback(null);
            } else {
                downloadCount++;
                fs.writeFile(`./${folder}/${image.title}-${downloadCount}.jpg`, res.body, function (err) {
                    if (err) {
                        console.log(err);
                    } else {
                        console.log("图片下载成功");
                    }
                    callback(null);
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
    let imgList = [];
    albumList.forEach(function (album) {
        album.imgList.forEach(function (imgUrl) {
            imgList.push({ title: album.title, url: imgUrl });
        });
    });
    q.push(imgList);//将所有任务加入队列
}

async function spiderRun() {
    let albumList = await getAlbumsAsync();//获取所有画册URL
    albumList = await getImageListAsync(albumList);//根据画册URL获取画册里的所有图片URL

    if (!fs.existsSync("Data")) {
        fs.mkdirSync("Data");
    }
    writeJsonToFile(albumList);//将画册信息保存为JSON
    if (Config.downloadImg) {
        downloadImg(albumList);//下载画册里面的所有图片
    }
}

spiderRun();

