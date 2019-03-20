module.exports = async function(archiveChannel) {
    var Discord = require('discord.js');
    var puppeteer = require("puppeteer");
    console.log("Archive started");
    try {
        var browser = await puppeteer.launch();
        var page = await browser.newPage();
        await page.setViewport({width:2048, height:2048});
        await page.goto("https://ourworldofpixels.com");
        await page.evaluate(function () { OWOP.camera.zoom = 1; });
        await new Promise(resolve => setTimeout(resolve, 2000));
        await page.evaluate(function () {
            for (let butt of document.getElementsByTagName('button')) {
                if (butt.innerText == 'OK') {butt.click();break}
            }
        });
        await new Promise(resolve => setTimeout(resolve, 60000));
        let screenshot = await page.screenshot({ type: 'png' });
        let filename = `Screenshot of ourworldofpixels.com/main @ ${new Date().toISOString()}.png`;
        let attachment = new Discord.Attachment(screenshot, filename);
        await archiveChannel.send(attachment);
        console.log("Archive finished");
    } finally {
        await browser.close();
    }
}