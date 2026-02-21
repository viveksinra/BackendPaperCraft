if (!process.env.MONGODB_URI) {
  process.env.MONGODB_URI = "mongodb://localhost:27017/papercraft";
}

if (process.env.SENTRY_DSN === undefined) {
  process.env.SENTRY_DSN = "";
}

if (!process.env.APP_NAME) {
  process.env.APP_NAME = "PaperCraft";
}

