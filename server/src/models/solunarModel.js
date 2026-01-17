// Lightweight model descriptions (JS doc-style)

/**
 * Location: { lat: number, lon: number }
 * HourlyWeather: { time: ISOString, temperature_2m: number, precipitation: number }
 * TideEntry: { time: ISOString, height_m: number } // provider-dependent
 * SolunarTimes: {
 *   date: YYYY-MM-DD,
 *   sun: { sunrise: ISOString, sunset: ISOString },
 *   moon: { moonrise: ISOString, moonset: ISOString, fraction: number },
 *   major: [{ type: 'moonrise'|'moonset', time: ISOString }],
 *   minor: [{ type: string, time: ISOString }]
 * }
 */

module.exports = {};
