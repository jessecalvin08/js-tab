import { useEffect, useState } from 'react';
import { WeatherService } from '../services/WeatherService.js';

const REFRESH_MS = 30 * 60 * 1000;
const CACHE_KEY = 'js-tab-weather-cache';

function readCache(city, units) {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) {
      return null;
    }

    const cached = JSON.parse(raw);
    const fresh = Date.now() - cached.at < REFRESH_MS;

    return fresh && cached.city === city && cached.data?.units === units ? cached.data : null;
  } catch {
    return null;
  }
}

function writeCache(city, data) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ city, at: Date.now(), data }));
  } catch {
    // cache is best-effort only
  }
}

export function useWeather(city, units = 'celsius') {
  const [weather, setWeather] = useState(() => readCache(city, units));
  const [error, setError] = useState('');

  useEffect(() => {
    if (!city) {
      return undefined;
    }

    let cancelled = false;

    const load = async () => {
      const cached = readCache(city, units);
      if (cached) {
        setWeather(cached);
        setError('');
        return;
      }

      try {
        const data = await WeatherService.getWeatherForCity(city, units);
        if (cancelled) {
          return;
        }
        setWeather(data);
        setError('');
        writeCache(city, data);
      } catch {
        if (!cancelled) {
          setError('Weather unavailable');
        }
      }
    };

    load();
    const timer = setInterval(load, REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [city, units]);

  return { weather, error };
}
