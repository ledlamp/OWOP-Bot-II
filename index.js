"use strict";

const Discord = require("discord.js");
const WebSocket = require("ws");

const config = require("./config");

var discordBot = new Discord.Client({disableEveryone:true});
discordBot.login(config.discord_token);
discordBot.on("error", console.error);
var banlist;

var bridges = {}; // owop websockets to discord channels
discordBot.once("ready", function(){
	for (let owopWorld in config.bridges) {
		let {discordChannels, password} = config.bridges[owopWorld];
		var b = createOWOPbridge(owopWorld, discordChannels, password);
		if (b) bridges[b.owopSocket] = b.discordChannels;
	}
	banlist = require("./banlist")(discordBot);
});


function createOWOPbridge(owopWorld, configDiscordChannels, password) {
	var discordChannels = configDiscordChannels.map(configDiscordChannel => {
		var c = discordBot.channels.get(configDiscordChannel.id);
		// attach webhook to channel object for webhook inter-discord-channel broadcast method
		if (configDiscordChannel.webhook) c.webhook = new Discord.WebhookClient(configDiscordChannel.webhook.id, configDiscordChannel.webhook.token, {disableEveryone: true});
		return c;
	}).filter(x => x);
	if (!configDiscordChannels.length) return console.error("Could not find any of the discord channels:", configDiscordChannels.map(x => x.id));
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
				// owop to discord
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
				let msg = data;
				//if (msg.startsWith("(A)")) msg = msg.replace("(A)", "**(A)**");
				//if (msg.startsWith("(M)")) msg = msg.replace("(M)", "**(M)**");
				//{ let x = msg.split(':'); x[0] = `**${x[0]}**`; msg = x.join(':'); } // bold prefix to distinguish from newline fakes
				if (msg.includes(':')) msg = '**' + msg.replace(':', ':**'); // simpler version of above, to include the colon in bold
				msg = msg.replace(/<@/g, "<\\@"); // filter mentions
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
		dv.setUint16(nstr[0].length, 25565/*OldProtocol.misc.worldVerification*/, true);
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
		if (!configDiscordChannels.map(x => x.id).includes(message.channel.id)) return; // only listen to the bridged channels
		if (message.author.id == discordBot.user.id) return; // ignore self of course
		if (discordChannels.filter(x => x.webhook).map(x => x.webhook.id).includes(message.author.id)) return; // ignore any of our webhooks

		if (banlist().includes(message.author.id)) return message.react("🚫"); // block users banned from owop discord //TODO only main world

		// broadcast message to other discord channels bridged to the same owop world
		discordChannels.forEach(discordChannel => {
			if (discordChannel.id == message.channel.id) return;
			if (discordChannel.webhook) {
				// send using webhook if available, to save visual space
				let username = message.member && message.member.displayName || message.author.username;
				if (message.guild) username += ' @ ' + message.guild.name;
				if (username.length > 32) username = username.substring(0, 31) + '…';
				discordChannel.webhook.send(message.cleanContent, {username, avatarURL: message.author.avatarURL, embeds: message.embeds, files: message.attachments})
					.catch(error => {
						console.error(`Failed to send Discord broadcast via webhook to discordChannel ${[discordChannel.id, '#'+discordChannel.name, discordChannel.guild.name]}:`, error.message);
						// fallback to embed if webhook fails
						regularBroadcast();
					});
			} else regularBroadcast();
			// send as embed
			function regularBroadcast() {
				discordChannel.send(
					new Discord.RichEmbed()
					.setAuthor(message.member && message.member.displayName || message.author.username, message.author.avatarURL)
					.setColor(message.member && message.member.displayColor)
					.setDescription(message.content)
					.setFooter(`from ${message.guild.name}`, message.guild.iconURL)
					.setImage(message.attachments.first() && message.attachments.first().width && message.attachments.first().url)
				).catch(error => console.error(`Failed to send Discord broadcast embed to discordChannel ${[discordChannel.id, '#'+discordChannel.name, discordChannel.guild.name]}:`, error.message));
			}
		});
		
		// discord to owop
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
		if (msg.startsWith('/')) msg = ' ' + msg;
		if (message.attachments.size > 0) msg += ' ' + message.attachments.map(a => a.url).join(' ');
		if (msg.length > 128) msg = msg.substr(0,127) + '…';
		owopSocket.send(msg + String.fromCharCode(10));
	});

	console.log("bridged owop world", owopWorld, "to discord channels", discordChannels.map(d => [d.id, d.name, d.guild.name]));
	return {owopSocket, discordChannels}
}


if (config.enable_commands) require("./commands")(discordBot);
if (config.reddit) require("./pixelart2reddit&facebook")(discordBot);
