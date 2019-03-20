
module.exports = {
	apps: [
		{
			name: "OWOP Bot",
			script: "index.js"
		},
		{
			name: "OWOP Bot Archive",
			script: "archive.js",
			cron_restart: "0 * * * *", // @hourly
			autorestart: false
		}
	]
};