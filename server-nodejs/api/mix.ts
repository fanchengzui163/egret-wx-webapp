///<reference path="../../server-node/typings/node/node.d.ts"/>
///<reference path="../../server-node/typings/express/express.d.ts"/>
import express = require('express');
import config = require('./config');
import https = require('https');
import querystring = require('querystring');
import crypto = require('crypto');
import events = require('events');
var event = new events.EventEmitter();

//常用函数库
export class wx {
    private sendGetToUrl(toUrl:string,data:any,callback:Function){
        toUrl += querystring.stringify(data);

        https.get(toUrl, function (res) {
            var datas = [];
            var size = 0;

            res.on('data', function (data) {
                datas.push(data);
                size += data.length;
            });

            res.on('end', function () {
                var buff = Buffer.concat(datas,size);
                var result = buff.toString();
                //将获得的数据传递
                callback(JSON.parse(result));
            })
        })
    }

    private checkTokenAndTicket(callback:Function){
        var time = new Date().getTime();
        if(time - config.wx.updateTime > 7199*1000){
            console.log("token和ticket过期");
            //token和ticket过期

            var myCall = callback;
            event.once('GetTicketComplete', function () {
                console.log("触发check里的callback事件");
                myCall();
            });

            var that = this;
            event.once('NextGetTicket',function(){
                that.getTicket();
            });

            //重新获取token
            this.getToken();
        }else {
            callback();
        }
    }

    private getToken(){
        console.log("重新获取token");
        var data = {
            grant_type:"client_credential",
            appid:config.wx.appid,
            secret:config.wx.appsecret
        };

        var toUrl = config.wx.weixinApiUrl.hostname + config.wx.weixinApiUrl.token;

        this.sendGetToUrl(toUrl,data,function(jsonData){
            config.wx.tokenStr = jsonData.access_token;
            config.wx.updateTime = new Date().getTime();
            console.log("token已更新", jsonData.access_token, "时间", config.wx.updateTime);
            event.emit("NextGetTicket");
        });
    }

    private getTicket(){
        console.log("重新获取ticket");
        var data = {
            access_token:config.wx.tokenStr,
            type:'jsapi'
        };

        var toUrl = config.wx.weixinApiUrl.hostname + config.wx.weixinApiUrl.jsticket;

        this.sendGetToUrl(toUrl,data,function(jsData:any){
            config.wx.ticketStr = jsData.ticket;
            console.log("ticket已更新", jsData.ticket);
            event.emit("GetTicketComplete");
        });
    }

    public getJsSign(res:express.Response,urlParams,next){
        //判断是否有url
        if(urlParams.query['url']){
            var jsData = {
                noncestr:"",
                timestamp:0,
                url:urlParams.query['url'],
                jsapi_ticket:""
            };

            var that = this;
            //注册发送js签名事件
            event.once('SendJsSdkSign',function(){
                that.sendJsSdkSign(jsData, res);
            });

            this.checkTokenAndTicket(function(){
                event.emit('SendJsSdkSign');
            });
            next();
        }else {
            res.status(400).send('no url');
        }
    }

    public sendJsSdkSign(jsData:any,res){
        console.log("进入sendJsSdkSign");
        jsData.noncestr = this.getNonceStr();
        jsData.jsapi_ticket = config.wx.ticketStr;
        jsData.timestamp = new Date().getTime();

        var arr1 = ['timestamp','noncestr','url','jsapi_ticket'];
        var arr2 = arr1.sort();
        var data = {};
        for(var i=0;i<arr2.length;i++){
            data[arr2[i]] = jsData[arr2[i]];
        }

        var toUrl:string = querystring.stringify(data);
        var shanum = crypto.createHash('sha1');
        shanum.update(toUrl);
        jsData.sign = shanum.digest('hex');
        res.json(jsData);
    }

    private getNonceStr():string{
        var str:string = "1234567890qwertyuiopasdfghjklzxcvbnmQWERTYUIOPASDFGHJKLZXCVBNM";
        var arr:Array<string> = str.split("");
        var nonceStr:string = "";
        arr.forEach(function(){
            if(nonceStr.length > 16){
                return
            }
            nonceStr += arr[Math.floor(Math.random()*arr.length)];
        });

        return nonceStr;
    }
}