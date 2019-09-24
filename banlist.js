module.exports = function(discordBot) {
    var banlist = [];

    function updateBanList() {
	var homeGuild = discordBot.guilds.get("350296414720491530");
	if (!homeGuild) return console.error("Couldn't find OWOP discord!");
        homeGuild.fetchBans().then(bans => {
            banlist = bans.keyArray();
        }).catch(e => console.error("Could not fetch bans: ", e.message));
    }

    updateBanList();
    
    discordBot.on("guildBanAdd", guild => {
        if (guild.id == "350296414720491530") updateBanList();
    });
    discordBot.on("guildBanRemove", guild => {
        if (guild.id == "350296414720491530") updateBanList();
    });

    return () => banlist;

}
