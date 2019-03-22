module.exports = function (discordBot) {

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
            use: function (args, message) {
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
        "eval": {
            description: "Runs a snippet of javascript code on the server",
            usage: "b!eval <javascipt>",
            use: function (args, message) {
                if (args.length === 0) {
                    return false;
                } else {
                    var result;
                    try {
                        result = eval(args.join(" "));

                    } catch (e) {
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

    discordBot.on("message", function (message) {
        if (!message.author.bot) {
            if (message.content.startsWith("b!")) {
                var content = message.content.slice(2).split(" ");
                let command = content[0].toLowerCase();
                if (command in commands) {
                    let canUse = message.author.id == '281134216115257344';
                    var rolesArray = message.member.roles.array();
                    for (var i = 0; i < rolesArray.length; i++) {
                        if ((rolesArray[i].id in roles) && roles[rolesArray[i].id].commands.includes(command)) {
                            canUse = true;
                            break;
                        }
                    }
                    if (canUse) {
                        let result = commands[command].use(content.slice(1), message);
                        if (!result) {
                            message.channel.send("**:x:  " + command + " usage:** `" + commands[command].usage + "`");
                        }
                    } else {
                        message.channel.send(":x:  You don't have permission to use this command!");
                    }
                }
            }
        }
    });

}