"use strict";

const Discord = require("discord.js");
const WebSocket = require("ws");

const credentials = require("./credentials");

var discordBot = new Discord.Client();
discordBot.login(credentials.discord_token);


var bridgemap = require('./bridges'); // owop world names to discord channel IDs
var bridges = {}; // owop websockets to discord channels
discordBot.once("ready", function(){
	for (let owopWorld in bridgemap) {
		let discordChannelID = bridgemap[owopWorld];
		var b = createOWOPbridge(owopWorld, discordChannelID);
		if (b) bridges[b.owopSocket] = b.discordChannel;
	}
});


function createOWOPbridge(owopWorld, discordChannelID) {

	var discordChannel = discordBot.channels.get(discordChannelID);
	if (!discordChannel) return console.error("Could not find Discord channel with ID", discordChannelID);

	var botId = 0;
	var owopSocket = new WebSocket("wss://ourworldofpixels.com", {
		origin: "https://ourworldofpixels.com/"
	});

	owopSocket.on("open", function () {
		console.log("owop", owopWorld, "open");
	});
	
	owopSocket.on("message", function (data) {

		if (typeof data == "string") {
			console.debug(`[${owopWorld}]`, data);

			if (data.startsWith(botId) || data.startsWith(`[${botId}]`)) return; // ignore self if regular user
			if (data.startsWith("[D]")) return; // ignore self if special discord user
			if (data.startsWith("DEV")) return;
			if (data.startsWith("Nickname")) return; // ignore nickname change messages
			if (data.startsWith("User: ")) return;
			if (data.startsWith("<")) return; // ignore HTML greeting
			if (data == "Server: You are now a moderator. Do /help for a list of commands.") return; // ignore that
			
			discordChannel.send(data, { split: { char: '' } });

		} else {
			switch (data.readUInt8(0)) {
				case 0: // Get id
					botId = data.readUInt32LE(1);
					console.log("owop", owopWorld, "ready");
					if (owopWorld == "main") owopSocket.send("/pass " + credentials.mod_password + String.fromCharCode(10));
					sendMove();
					setInterval(sendMove, 600000);
					break;
				case 5: // Captcha
					switch (data.readUInt8(1)) {
						case 0:
							owopSocket.send("CaptchALETMEINPLZ" + credentials.captcha_password);
							break;
						case 3:
							joinWorld(owopWorld);
							break;
					}
					break;
			}
		}
	});
	owopSocket.on("close", function () {
		console.log("owop", owopWorld, "close");
	});
	owopSocket.on("error", function (error) {
		console.error("owop", owopWorld, "error:", error);
	});

	function sendMove() {
		owopSocket.send(new Buffer([127, 255, 255, 255, 127, 255, 255, 255, 0, 0, 0, 0]));
	}
	function joinWorld(name) {
		var nstr = stoi(name, 24/*OldProtocol.maxWorldNameLength*/);
		//_global.eventSys.emit(_conf.EVENTS.net.world.joining, name);
		var array = new ArrayBuffer(nstr[0].length + 2);
		var dv = new DataView(array);
		for (var i = nstr[0].length; i--;) {
			dv.setUint8(i, nstr[0][i]);
		}
		dv.setUint16(nstr[0].length, 4321/*OldProtocol.misc.worldVerification*/, true);
		owopSocket.send(array);
		return nstr[1];
	}
	function stoi(string, max) {
		var ints = [];
		var fstring = "";
		string = string.toLowerCase();
		for (var i = 0; i < string.length && i < max; i++) {
			var charCode = string.charCodeAt(i);
			if (charCode < 123 && charCode > 96 || charCode < 58 && charCode > 47 || charCode == 95 || charCode == 46) {
				fstring += String.fromCharCode(charCode);
				ints.push(charCode);
			}
		}
		return [ints, fstring];
	}


	discordBot.on("message", function (message) {
		if (message.channel.id != discordChannelID) return;
		if (message.author.id == discordBot.user.id) return;
		if (owopSocket.readyState == WebSocket.OPEN) {
			let nickname = (message.member && message.member.displayName) || message.author.username;
			if (owopWorld != "main") {
				nickname = `[D] ${nickname}`;
				if (nickname.length > 16) nickname = nickname.substr(0,15) + '…';
			}
			owopSocket.send("/nick " + nickname + String.fromCharCode(10));
			owopSocket.send("​" + message.cleanContent + String.fromCharCode(10));
		}
	});


	console.log("bridged owop world", owopWorld, "with discord channel", discordChannelID, `(#${discordChannel.name})`, "in guild", discordChannel.guild.name);
	return {owopSocket, discordChannel}

}

