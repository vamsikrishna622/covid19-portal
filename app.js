const express = require("express");
const path = require("path");

const app = express();
app.use(express.json());

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

let db = null;
const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

///Middleware Function
const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "vamsi", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

///verifying user
app.post("/users/", async (request, response) => {
  const { username, password } = request.body;
  const hashedPassword = await bcrypt.hash(request.body.password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    const createUserQuery = `
      INSERT INTO 
        user (username, password) 
      VALUES 
        (
          '${username}', 
          '${hashedPassword}',
        )`;
    const dbResponse = await db.run(createUserQuery);
    const newUserId = dbResponse.lastID;
    response.send(`Created new user with ${newUserId}`);
  } else {
    response.status = 400;
    response.send("User already exists");
  }
});

///API 1 Generating Token
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUserQuery = `
        SELECT *
        FROM user
        WHERE username = '${username}';
    `;
  const dbUser = await db.get(getUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "vamsi");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

///API 2
app.get("/states/", authenticateToken, async (request, response) => {
  const getAllStates = `
    SELECT *
    FROM state;
    `;
  const allStatesList = await db.all(getAllStates);
  response.send(allStatesList);
  const convertDbObjToResponseObj = (allStatesList) => {
    let statesList = [];
    for (eachState of allStatesList) {
      const state = {
        stateId: eachState.state_id,
        stateName: eachState.state_name,
        population: eachState.population,
      };
      statesList.push(state);
    }
    return statesList;
  };
  const statesList = convertDbObjToResponseObj(allStatesList);
  response.send(statesList);
});
///API 3
app.get("/states/:stateId/", authenticateToken, async (request, response) => {
  let { stateId } = request.params;
  stateId = parseInt(stateId);
  const getState = `
    SELECT *
    FROM state
    WHERE
    state_id = ${stateId};
    `;

  let state = await db.get(getState);
  state = {
    stateId: state.state_id,
    stateName: state.state_name,
    population: state.population,
  };
  response.send(state);
});

///API 4
app.post("/districts/", authenticateToken, async (request, response) => {
  const districtDetails = request.body;
  const {
    districtName,
    stateId,
    cases,
    cured,
    active,
    deaths,
  } = districtDetails;

  const addDistrictQuery = `
  INSERT INTO
  district
    (district_name,
    state_id,
    cases,
    cured,
    active,
    deaths)
    
    VALUES(
    "${districtName}",
    ${stateId},
    ${cases},
    ${cured},
    ${active},
    ${deaths});
  `;

  const dbResponse = await db.run(addDistrictQuery);
  const districtId = dbResponse.lastId;
  response.send("District Successfully Added");
});

///API 4
app.get(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    let { districtId } = request.params;
    districtId = parseInt(districtId);

    const getDistrictQuery = `
    SELECT *
    FROM
    district
    WHERE
    district_id = ${districtId};
    `;
    const dbResponse = await db.get(getDistrictQuery);
    const district = {
      districtId: dbResponse.district_id,
      districtName: dbResponse.district_name,
      stateId: dbResponse.state_id,
      cases: dbResponse.cases,
      cured: dbResponse.cured,
      active: dbResponse.active,
      deaths: dbResponse.deaths,
    };

    response.send(district);
  }
);

///API 6
app.delete(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    let { districtId } = request.params;
    districtId = parseInt(districtId);

    const deleteDistrictQuery = `
    DELETE
    FROM district
    WHERE
    district_id = ${districtId};
    `;
    await db.run(deleteDistrictQuery);
    response.send("District Removed");
  }
);

///API 7
app.put(
  "/districts/:districtId",
  authenticateToken,
  async (request, response) => {
    const districtDetails = request.body;
    let { districtId } = request.params;
    districtId = parseInt(districtId);

    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;
    const updateDistrictQuery = `
    UPDATE district
    SET
    district_name='${districtName}',
    state_id=${stateId},
    cases=${cases},
    cured=${cured},
    active=${active},
    deaths=${deaths}
    WHERE
    district_id = ${districtId};
  `;

    await db.run(updateDistrictQuery);
    response.send("District Details Updated");
  }
);

///API 8
app.get(
  "/states/:stateId/stats/",
  authenticateToken,
  async (request, response) => {
    let { stateId } = request.params;
    stateId = parseInt(stateId);

    const getStateStats = `
    SELECT
    SUM(cases) AS totalCases,
     SUM(cured) AS totalCured,
     SUM(active) AS totalActive,
      SUM(deaths) AS totalDeaths
    FROM
    district
    WHERE state_id = ${stateId}
    GROUP BY state_id;
    `;
    const stateStats = await db.all(getStateStats);
    response.send(stateStats[0]);
  }
);

module.exports = app;
