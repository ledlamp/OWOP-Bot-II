#!/usr/bin/env node
var Discord = require('discord.js');
var puppeteer = require("puppeteer");
var config = require("./config");
var archive_webhook = new Discord.WebhookClient(config.archive_webhook.id, config.archive_webhook.token);

(async function archive() {
    console.log("Archive started");
    var browser = await puppeteer.launch({args:['--no-sandbox']});
    var page = await browser.newPage();
    await page.setViewport({width:2048, height:2048});
    console.log("Page opened");
    await page.goto("https://ourworldofpixels.com");
    console.log("OWOP Loaded");
    await page.evaluate(async function (captcha_password) {
        OWOP.camera.zoom = 1;
        OWOP.options.noUi = true;
        localStorage.owopOptions = '{"defaultZoom": 1, "noUi": true}';
        localStorage.owopcaptcha = captcha_password;
        for (let butt of document.getElementsByTagName('button')) {
            if (butt.innerText == 'OK') {butt.click();break}
        }
        await new Promise(resolve => {
            OWOP.once(OWOP.events.allChunksLoaded, () => {
                resolve();
            });
            setTimeout(resolve, 60000);
        });
    }, config.captcha_password);
    console.log("Saving screenshot");
    let screenshot = await page.screenshot({ type: 'png' });
    let filename = `OWOP archive ${new Date().toISOString()}.png`;
    let attachment = new Discord.Attachment(screenshot, filename);
    await archive_webhook.send(attachment);
    console.log("Archive finished");
    await browser.close();
})();

process.on("unhandledRejection", error => {
    console.error(error);
    process.exit(1);
});