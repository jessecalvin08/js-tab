// WMO weather interpretation codes, condensed into labels the widget can show.
const WEATHER_CODES = {
  0: 'Clear',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Cloudy',
  45: 'Fog',
  48: 'Rime fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Heavy drizzle',
  56: 'Freezing drizzle',
  57: 'Freezing drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  66: 'Freezing rain',
  67: 'Freezing rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Showers',
  81: 'Showers',
  82: 'Heavy showers',
  85: 'Snow showers',
  86: 'Snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm',
  99: 'Thunderstorm'
};

export function describeWeatherCode(code) {
  return WEATHER_CODES[code] ?? 'Unknown';
}

export const WeatherService = {
  async geocode(city) {
    const endpoint = new URL('https://geocoding-api.open-meteo.com/v1/search');
    endpoint.searchParams.set('name', city);
    endpoint.searchParams.set('count', '1');

    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error('Unable to find that place');
    }

    const data = await response.json();
    const match = data?.results?.[0];

    if (!match) {
      throw new Error('Unable to find that place');
    }

    return { latitude: match.latitude, longitude: match.longitude, name: match.name };
  },

  async getForecastByCoordinates({ latitude, longitude, units = 'celsius' }) {
    const temperatureUnit = units === 'fahrenheit' ? 'fahrenheit' : 'celsius';
    const endpoint = new URL('https://api.open-meteo.com/v1/forecast');

    endpoint.searchParams.set('latitude', latitude);
    endpoint.searchParams.set('longitude', longitude);
    endpoint.searchParams.set('current', 'temperature_2m,weather_code');
    endpoint.searchParams.set('temperature_unit', temperatureUnit);

    const response = await fetch(endpoint);

    if (!response.ok) {
      throw new Error('Unable to load weather data');
    }

    return response.json();
  },

  async getWeatherForCity(city, units) {
    const place = await this.geocode(city);
    const forecast = await this.getForecastByCoordinates({ ...place, units });

    return {
      place: place.name,
      temperature: Math.round(forecast?.current?.temperature_2m ?? 0),
      code: forecast?.current?.weather_code ?? 0,
      label: describeWeatherCode(forecast?.current?.weather_code ?? 0),
      units
    };
  }
};
