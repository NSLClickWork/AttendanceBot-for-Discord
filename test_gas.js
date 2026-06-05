const fetch = require('node-fetch');

async function run() {
  const url = "https://script.google.com/macros/s/AKfycbyCw634fMTy46kmOJGNFsbw5k6yUEb7TQIi4IeYZnUVP0VzLVMUBh2j9YihvLXgUh5d/exec";
  const start = new Date(Date.now() + 1000 * 60 * 60).toISOString(); 
  const end = start; // IDENTICAL TIMES!
  
  const payload = {
    events: [{
      employeeId: "test",
      title: "Shift: 0 seconds test",
      startAt: start,
      endAt: end,
      notes: "testing"
    }],
    calendarId: "e8b407ce4128011dbff8b231ff5691f455034f7151cdc2b44d2c9361216332b9@group.calendar.google.com"
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const text = await res.text();
    console.log("Status:", res.status);
    console.log("Response:", text);
  } catch (err) {
    console.error(err);
  }
}

run();
