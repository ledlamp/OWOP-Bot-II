"use strict";

const Discord = require("discord.js");
const WebSocket = require("ws");
const Canvas = require("canvas");

const credentials = require("./credentials");

const Token = credentials.discord_token;
const ServerId = "350296414720491530";
const adminPass = "";

var gatewayChannel,
    archiveChannel;

let bot = new Discord.Client();
global.bot = bot; // debug



let chunkRequest = {};
let chunkChannel;
let chunkSize = [0, 0];
let chunkStart = [0, 0];

// Connect to owop
let botId = 0;
let owopBot = new WebSocket("wss://ourworldofpixels.com", {
  origin: "https://ourworldofpixels.com/"
});
owopBot.on("open", function() {
  console.log("owop open!");
});
//owopBot.on("message", console.log);
owopBot.on("message", function(data) {
  if (typeof data == "string") {
    if	(
			!data.startsWith(`[${botId}]`) &&
			!data.startsWith(botId) &&
			!data.startsWith("[D]") &&
			!data.startsWith("DEV") &&
			!data.startsWith("Nickname") &&
			!data.startsWith("User: ") &&
			!data.startsWith("<")
	) {
      if (gatewayChannel) {
        gatewayChannel.send(data, {split:{char:''}});
      }
    }
  } else {
    switch(data.readUInt8(0)) {
      case 0: // Get id
        botId = data.readUInt32LE(1);
        console.log("owop ready!");
        if (adminPass) owopBot.send("/adminlogin " + adminPass + String.fromCharCode(10));
        sendMove();
        setInterval(sendMove, 600000);
        break;
      case 1: // Get all cursors, tile updates, disconnects
        
        break;
      case 2: // Get chunk
        break; // idk how to fix D:
        let x = data.readInt32LE(1);
        let y = data.readInt32LE(5);
        console.log(data);
        var u8data = new Uint8Array(data, 10, data.byteLength - 10);
        console.log(u8data);
        u8data = decompress(u8data);
        console.log(u8data);
        var u32data = new Uint32Array(16 /*OldProtocol.chunkSize*/ * 16/*OldProtocol.chunkSize*/);
        for (var i = 0, u = 0; i < u8data.length; i += 3) {
          /* Need to make a copy ;-; */
          var color = u8data[i + 2] << 16 | u8data[i + 1] << 8 | u8data[i];
          u32data[u++] = 0xFF000000 | color;
        }
        console.log(u32data);
        data = Buffer.from(u32data);
        console.log(data);
        if ([x, y] in chunkRequest) {
          let image = new Canvas(16, 16);
          let imageData = image.getContext("2d").createImageData(16, 16);
          for (let i=0, n=0; i<1024; i+=4, n++) {
            imageData.data[i] = data.readUInt8(9 + n * 3);
            imageData.data[i + 1] = data.readUInt8(10 + n * 3);
            imageData.data[i + 2] = data.readUInt8(11 + n * 3);
            imageData.data[i + 3] = 255;
          }
          image.getContext("2d").putImageData(imageData, 0, 0);
          chunkRequest[[x, y]] = {
            done: true,
            x: x - chunkStart[0],
            y: y - chunkStart[1],
            image: image
          };
          
          let allDone = true;
          for (let i in chunkRequest) {
            if (!chunkRequest[i].done) {
              allDone = false;
              break;
            }
          }
          if (allDone) {
            let canvas = new Canvas(chunkSize[0] * 16, chunkSize[1] * 16);
            let ctx = canvas.getContext("2d");
            for (let i in chunkRequest) {
              ctx.drawImage(chunkRequest[i].image, chunkRequest[i].x * 16, chunkRequest[i].y * 16);
            }
            chunkChannel.send("", new Discord.Attachment(canvas.toBuffer(), "region.png"));
            chunkChannel.stopTyping();
            chunkRequest = {};
          }
        }
        break;
      case 3: // Teleport
        
        break;
      case 4: // Get rank
        var rank = data.readUInt8(1);
        break;
      case 5: // Captcha
        switch(data.readUInt8(1)) {
          case 0:
            if (adminPass) owopBot.send("CaptchALETMEINPLS" + adminPass);
            break;
          case 3:
            //owopBot.send(new Buffer([109, 97, 105, 110, 57, 5]));
            joinWorld("main");
            break;
        }
        break;
    }
  }
});
owopBot.on("close", function() {
  console.log("owop close!!!");
});
owopBot.on("error", function(error){
	console.error(error);
});
function sendMove() {
  owopBot.send(new Buffer([127, 255, 255, 255,   127, 255, 255, 255,   0, 0, 0, 0]));
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
	owopBot.send(array);
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
function decompress(u8arr) {
	var originalLength = u8arr[1] << 8 | u8arr[0];
	var u8decompressedarr = new Uint8Array(originalLength);
	var numOfRepeats = u8arr[3] << 8 | u8arr[2];
	var offset = numOfRepeats * 2 + 4;
	var uptr = 0;
	var cptr = offset;
	for (var i = 0; i < numOfRepeats; i++) {
		var currentRepeatLoc = (u8arr[4 + i * 2 + 1] << 8 | u8arr[4 + i * 2]) + offset;
		while (cptr < currentRepeatLoc) {
			u8decompressedarr[uptr++] = u8arr[cptr++];
		}
		var repeatedNum = u8arr[cptr + 1] << 8 | u8arr[cptr];
		var repeatedColorR = u8arr[cptr + 2];
		var repeatedColorG = u8arr[cptr + 3];
		var repeatedColorB = u8arr[cptr + 4];
		cptr += 5;
		while (repeatedNum--) {
			u8decompressedarr[uptr] = repeatedColorR;
			u8decompressedarr[uptr + 1] = repeatedColorG;
			u8decompressedarr[uptr + 2] = repeatedColorB;
			uptr += 3;
		}
	}
	while (cptr < u8arr.length) {
		u8decompressedarr[uptr++] = u8arr[cptr++];
	}
	return u8decompressedarr;
}



let roles = {
  "350303014944505866": { // Admin
    commands: ["help", "view", "eval"]
  },
  "350296414720491530": { // @everyone
    commands: ["help", "view"]
  }
};

let commands = {
  "help": {
    description: "Guess what it does",
    usage: "b!help (<command>)",
    use: function(args, message) {
      if (args.length == 1 && args[0].toLowerCase() in commands) {
        message.channel.send("**" + args[0].toLowerCase() + " usage:** `" + commands[args[0].toLowerCase()].usage + "`");
      } else {
        var output = "**Command List**\n```markdown";
        for (var i in commands) {
          output += "\n[ " + i + " ](" + commands[i].description + ")";
        }
        output += "```";
        message.channel.send(output);
      }
      return true;
    }
  },
  /*"view": {
    description: "View a region of chunks on OWOP",
    usage: "b!view <chunkX> <chunkY> (<width> <height>)",
    use: function(args, message) {
      if (chunkRequest.length) {
        message.channel.send(":x:  **Chunk render already in progress! Please wait**");
        return true;
      } else if (args.length == 2 || args.length == 4) {
        let x = parseInt(args[0]);
        let y = parseInt(args[1]);
        let w = parseInt(args[2]) || 1;
        let h = parseInt(args[3]) || 1;
        
        if (isNaN(x) || isNaN(y)) {
          return false;
        } else if (x > 0xFFFFF || x < ~0xFFFFF || y > 0xFFFFF || y < ~0xFFFFF || x + w > 0xFFFFF || x + w < ~ 0xFFFFF || y + h > 0xFFFFF || y + h < ~0xFFFFF) {
          message.channel.send(":x:  **Chunks out of range!**");
          return false;
        } else if (!message.member.roles.has("350303014944505866") && w * h > 576) {
          message.channel.send(":x:  **Area too large! Max 576 chunks**");
          return false;
        }
        
        message.channel.startTyping();
        
        setTimeout(function() {
          chunkChannel = message.channel;
          chunkStart = [x, y];
          chunkSize = [w, h];

          for (let xx=x; xx<x+w; xx++) {
            for (let yy=y; yy<y+h; yy++) {
              chunkRequest[[xx, yy]] = {
                done: false
              };
              var buffer = new Buffer(8);
              buffer.writeInt32LE(xx, 0);
              buffer.writeInt32LE(yy, 4);
              owopBot.send(buffer);
            }
          }
        }, 100);
        return true;
      } else {
        return false;
      }
      return false;
    }
  },*/
  "eval": {
    description: "Runs a snippet of javascript code on the server",
    usage: "b!eval <javascipt>",
    use: function(args, message) {
      if (args.length === 0) {
        return false;
      } else {
        var result;
        try {
          result = eval(args.join(" "));
          
        } catch(e) {
          message.channel.send(e.toString());
          return true;
        }
        if (typeof result == "undefined") {
          message.channel.send("`undefined`");
        } else if (typeof result == "number") {
          message.channel.send("`" + result + "`");
        } else if (typeof result == "string") {
          message.channel.send("`\"" + result + "\"`");
        } else if (Array.isArray(result)) {
          message.channel.send("`" + JSON.stringify(result) + "`");
        } else {
          message.channel.send("`" + result.toString() + "`");
        }
        return true;
      }
    }.bind(this)
  }
};


bot.on("ready", function() {
  console.log("Discord Ready!");
  gatewayChannel = bot.channels.get("398541666442674187");
  archiveChannel = bot.channels.get("399099019063721995");
});

bot.on("message", function(message) {
  if (!message.author.bot) {
    if (message.content.startsWith("b!")) {
      var content = message.content.slice(2).split(" ");
      let command = content[0].toLowerCase();
      if (command in commands) {
        let canUse = message.author.id == '281134216115257344';
        var rolesArray = message.member.roles.array();
        for (var i=0; i<rolesArray.length; i++) {
          if ((rolesArray[i].id in roles) && roles[rolesArray[i].id].commands.includes(command)) {
            canUse = true;
            break;
          }
        }
        /*  if ((msg.member.roles[i] in roles) && roles[msg.member.roles[i]].commands.indexOf(command) != -1) {
            canUse = true;
            break;
          }
        }*/

        if (canUse) {
          let result = commands[command].use(content.slice(1), message);
          if (!result) {
            message.channel.send("**:x:  " + command + " usage:** `" + commands[command].usage + "`");
          }
        } else {
          message.channel.send(":x:  You don't have permission to use this command!");
        }
      }
    } else if (message.channel.id == "398541666442674187") {
      if (owopBot.readyState == WebSocket.OPEN) {
	let nickname = (message.member && message.member.displayName) || message.author.username;
	nickname = `[D] ${nickname}`;
	nickname = nickname.substr(0,12);
        owopBot.send("/nick " + nickname + String.fromCharCode(10));
        owopBot.send("​" + message.cleanContent + String.fromCharCode(10));
      }
    }
  }
});
bot.on("messageDelete", function(message) {
  var deleted_messages = bot.channels.find("name", "deleted-messages");
  if (deleted_messages) deleted_messages.send("<@" + message.author.id + ">\n```" + message.content.replace(/`/g, "`​") + "```\nDeleted from <#" + message.channel.id + ">")
                                        .catch(()=>{});
  //bot.createMessage("398548887314628608", "`" + msg.id + "` Deleted from <#" + msg.channel.id + ">, content wasn't cached!");
});

bot.login(Token);

// Archive
/*global.archive = function archive() {
  if (!archiveChannel || chunkRequest.length) {
    console.log("ARCHIVE IDLE!");
    setTimeout(archive, 1000);
    return;
  }
  
  archiveChannel.startTyping();
  
  setTimeout(function() {
    chunkChannel = archiveChannel;
    chunkStart = [-50, -50];
    chunkSize = [100, 100];

    for (let x=-50; x<50; x++) {
      for (let y=-50; y<50; y++) {
        chunkRequest[[x, y]] = {
          done: false
        };
        var buffer = new Buffer(8);
        buffer.writeInt32LE(x, 0);
        buffer.writeInt32LE(y, 4);
        owopBot.send(buffer);
      }
    }
  }, 100);
}*/

var archive = require('./archive');
setInterval(archive, 1000 * 60 * 60);
