
const moment = require('moment');
// Test cases: hourOfDay, dayOfWeek, clientAppTimeStamp, expectedTimeZoneDiff
// 1. daily normal - 10, null, '2022-02-08T03:18:25.646Z', +8
// 2. daily +1 day hour - 22, null, '2022-02-07T19:18:25.646Z', -8
// 3. daily -1 day hour - 6, null, '2022-02-08T03:18:25.646Z', +8
// 4. weekly normal - 10, 2, '2022-02-08T03:18:25.646Z', +8
// 5. weekly +1 week - 22, null, '2022-02-07T19:18:25.646Z', -8
// 6. weekly -1 week - 6, null, '2022-02-08T03:18:25.646Z', +8

// test input
const state = 'daily';
const hourOfDay = 22;
const dayOfWeek = 7;
const clientAppTimeStamp = '2022-02-07T19:18:25.646Z'


// convert to next trigger date. (Non-UTC date here yet)
const nowDate = new Date();
console.log(moment(nowDate))
const timeZoneDiffInHours = Math.round(moment(clientAppTimeStamp).diff(moment(nowDate).add(-8, 'hours'), 'hours', true));
console.log(timeZoneDiffInHours);
let hourOfDayUtc = hourOfDay - timeZoneDiffInHours;
let dayOffset = 0;
if (hourOfDayUtc < 0) {
    dayOffset = -1;
    hourOfDayUtc += 24;
}
else if (hourOfDayUtc >= 24) {
    dayOffset = 1;
    hourOfDayUtc -= 24;
}

let startTime;
switch (state) {
    case 'daily':
        startTime = moment(nowDate).utc().hours(hourOfDayUtc).seconds(0).minutes(0);
        break;
    case 'weekly':
        const dayOfWeekUtc = dayOfWeek + dayOffset;
        startTime = moment(nowDate).utc().day(dayOfWeekUtc).hours(hourOfDayUtc).seconds(0).minutes(0);
        break;
}

console.log(startTime.toISOString());
if(state==='weekly')
{
    console.log(moment(startTime).day());
}