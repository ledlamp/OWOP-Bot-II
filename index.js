"use strict";

const Discord = require("discord.js");
const WebSocket = require("ws");

const config = require("./config");

var discordBot = new Discord.Client({disableEveryone:true});
discordBot.login(config.discord_token);
discordBot.on("error", console.error);
var banlist;

var bridgemap = config.bridges; // owop channel to bridge info (discord channel id, password)
var bridges = {}; // owop websockets to discord channels
discordBot.once("ready", function(){
	for (let owopWorld in bridgemap) {
		let {discordChannelIDs, password} = bridgemap[owopWorld];
		var b = createOWOPbridge(owopWorld, discordChannelIDs, password);
		if (b) bridges[b.owopSocket] = b.discordChannels;
	}
	banlist = require("./banlist")(discordBot);
});


function createOWOPbridge(owopWorld, discordChannelIDs, password) {
	var discordChannels = discordChannelIDs.map(discordChannelID => discordBot.channels.get(discordChannelID)).filter(x => x);
	if (!discordChannels.length) return console.error("Could not find any of the discord channels:", discordChannelIDs);
	var botId = 0, owopSocket;
	(function connect() {
		owopSocket = new WebSocket("wss://ourworldofpixels.com", {
			origin: "https://ourworldofpixels.com/"
		});
		owopSocket.on("open", function () {
			console.log("owop", owopWorld, "open");
		});
		owopSocket.on("message", function (data) {
			if (typeof data == "string") {
				console.log(`[${owopWorld}]`, data);
				if (data.startsWith(botId) || data.startsWith(`[${botId}]`)) return; // ignore self if regular user
				if (data.startsWith("[D]")) return; // ignore self if special discord user
				if (data.startsWith("DEV")) return;
				if (data.startsWith("Nickname")) return; // ignore nickname change messages
				if (data.startsWith("User: ")) return;
				if (data.startsWith("<")) return; // ignore HTML greeting
				if (data == "Server: You are now a moderator. Do /help for a list of commands.") return; // ignore that
				if (data.startsWith("[Server]")) return; // ignore [Server] messages
				if (data.startsWith("->")) return; // ignore direct messages because spam
				let msg = data.replace(/<@/g, "<\\@"); // filter mentions
				if (owopWorld == "main") msg = require('./antiswear')(msg);
				for (let discordChannel of discordChannels) {
					let lastMessage = discordChannel.messages.last();
					if (lastMessage && lastMessage.originalMsg && lastMessage.originalMsg == msg && lastMessage.author.id == discordBot.user.id) {
						// if this owop message is same as source of last message and last message was sent by this bot
						// edit last message with incremented number of repetitions
						let postfix = ` [x${++lastMessage.repetitions}]`;
						lastMessage.edit(msg.substr(0, 2000-postfix.length) + postfix).catch(error => console.error(`Could not edit message ${lastMessage.id}`, error.message));
						lastMessage.realmsg = msg; // attach actual message to Message object because now the message content has been edited
					} else {
						// send new message
						discordChannel.send(msg, { split: { char: '' } }).then(message => {
							message.originalMsg = msg; // attach original owop message to Message object so we can edit for repetitions
							message.repetitions = 1; // keep track of number of repetitions
						}).catch(error => console.error(`Failed to send OWOP message to discordChannel ${[discordChannel.id, '#'+discordChannel.name, discordChannel.guild.name]}:`, error.message));
					}
				}
			} else {
				switch (data.readUInt8(0)) {
					case 0: // Get id
						botId = data.readUInt32LE(1);
						console.log("owop", owopWorld, "ready");
						if (password) owopSocket.send("/pass " + password + String.fromCharCode(10));
						sendMove();
						break;
					case 5: // Captcha
						switch (data.readUInt8(1)) {
							case 0:
								owopSocket.send("CaptchALETMEINPLZ" + config.captcha_password);
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
			setTimeout(()=>{
				connect();
			}, 5000);
		});
		owopSocket.on("error", function (error) {
			console.error("owop", owopWorld, "error:", error);
		});
	})();

	function sendMove() {
		if (owopSocket.readyState == WebSocket.OPEN) owopSocket.send(new Buffer([127, 255, 255, 255, 127, 255, 255, 255, 0, 0, 0, 0]));
	}
	setInterval(sendMove, 600000);
	function joinWorld(name) {
		var nstr = stoi(name, 24/*OldProtocol.maxWorldNameLength*/);
		//_global.eventSys.emit(_conf.EVENTS.net.world.joining, name);
		var array = new ArrayBuffer(nstr[0].length + 2);
		var dv = new DataView(array);
		for (var i = nstr[0].length; i--;) {
			dv.setUint8(i, nstr[0][i]);
		}
		dv.setUint16(nstr[0].length, 4321/*OldProtocol.misc.worldVerification*/, true);
		if (owopSocket.readyState == WebSocket.OPEN) owopSocket.send(array);
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
		if (!discordChannelIDs.includes(message.channel.id)) return;
		if (message.author.id == discordBot.user.id) return;

		if (message.content.startsWith("/")) return message.react("🚫"); // disallow users running commands as the bot
		if (banlist().includes(message.author.id)) return message.react("🚫"); // ignore users banned from owop discord

		discordChannels.forEach(discordChannel => {
			if (discordChannel.id == message.channel.id) return;
			discordChannel.send(
				new Discord.RichEmbed()
				.setAuthor(message.member && message.member.displayName || message.author.username, message.author.avatarURL)
				.setColor(message.member && message.member.displayColor)
				.setDescription(message.content)
				.setFooter(`from ${message.guild.name}`, message.guild.iconURL)
			).catch(error => console.error(`Failed to send Discord broadcast embed to discordChannel ${[discordChannel.id, '#'+discordChannel.name, discordChannel.guild.name]}:`, error.message));;
		});

		if (owopSocket.readyState != WebSocket.OPEN) return;
		let authorname = (message.member && message.member.displayName) || message.author.username;
		let nickname, prefix = "";
		if (password) {
			if (owopWorld == "main") {
				nickname = authorname;
			} else {
				nickname = `[D] ${authorname}`;
			}
			if (owopWorld != "main") if (nickname.length > 16) nickname = nickname.substr(0,15) + '…';
		} else {
			prefix = `[D] ${authorname}: `;
		}
		if (nickname) owopSocket.send("/nick " + nickname + String.fromCharCode(10));
		let msg = prefix + message.cleanContent;
		if (msg.length > 128) msg = msg.substr(0,127) + '…';
		owopSocket.send(msg + String.fromCharCode(10));
	});

	console.log("bridged owop world", owopWorld, "to discord channels", discordChannels.map(d => [d.id, d.name, d.guild.name]));
	return {owopSocket, discordChannels}
}


if (config.enable_commands) require("./commands")(discordBot);
if (config.reddit) require("./pixelart2reddit&facebook")(discordBot);
