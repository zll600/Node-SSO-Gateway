const express = require("express");
const morgan = require("morgan");
const engine = require("ejs-mate");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const mongoose = require("mongoose");
const router = require("./router");
const cors = require("cors");
const cookieSession = require('cookie-session');
const controller = require("./controller");

const app = express();

// Configure session with MongoDB store
// app.use(
//   session({
//     secret: "relax",
//     resave: false,
//     saveUninitialized: false,
//     store: MongoStore.create({
//       mongoUrl: "mongodb://127.0.0.1:27017/sso-session",
//       collectionName: "sessions",
//     }),
//     cookie: {
//       secure: false, // Set to true if using HTTPS
//       maxAge: 24 * 60 * 60 * 1000, // 1 day
//       sameSite: 'lax', // Adjust based on client-server interaction
//     },
//   })
// );

controller.connectDB();

app.use(cookieSession({
  name: 'session',
  keys: ["user"],

  // Cookie Options
  maxAge: 24 * 60 * 60 * 1000 // 24 hours
}))

app.use(
  cors({
    origin: ["http://127.0.0.1:3001"], // Client URL
    credentials: true, // Allow cookies in requests
  })
);

app.use((req, res, next) => {
  if (!req.session) {
    console.error("Session is missing. Check client-side cookie settings.");
  }
  next();
});


// app.use(
//   session({
//     secret: "relax",
//     resave: false,
//     saveUninitialized: false,
//     cookie: {
//       secure: false, // Set to true if using HTTPS
//       maxAge: 24 * 60 * 60 * 1000, // 1 day in milliseconds
//     },
// }));


app.use((req, res, next) => {
  if (!req.session) {
    console.error("Session could not be created!");
  }
  next();
});
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(morgan("dev"));
app.engine("ejs", engine);
app.set("views", __dirname + "/views");
app.set("view engine", "ejs");

app.use("/simplesso", router);
app.get("/", (req, res, next) => {
  const user = req.session.user || "unlogged";
  res.render("index", {
    what: `SSO-Server ${user}`,
    title: "SSO-Server | Home",
  });
});

app.use((req, res, next) => {
  // catch 404 and forward to error handler
  const err = new Error("Resource Not Found");
  err.status = 404;
  next(err);
  next();
});

app.use((err, req, res, next) => {
  console.error({
    message: err.message,
    error: err,
  });
  const statusCode = err.status || 500;
  let message = err.message || "Internal Server Error";

  if (statusCode === 500) {
    message = "Internal Server Error";
  }
  res.status(statusCode).json({ message });
});



app.listen(3000, () => {
  console.log("Server is running on http://localhost:3000");
});
