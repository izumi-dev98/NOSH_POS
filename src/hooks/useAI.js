import { useState, useCallback } from 'react';
import { chatWithAI, analyzeData, fetchFromTable, fetchAllSystemData } from '../lib/anthropic';

export function useAI() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const sendMessage = useCallback(async (message, history = []) => {
    setLoading(true);
    setError(null);
    try {
      const result = await chatWithAI(message, history);
      if (!result.success) {
        setError(result.error);
      }
      return result;
    } catch (e) {
      setError(e.message);
      return { success: false, error: e.message };
    } finally {
      setLoading(false);
    }
  }, []);

  const analyze = useCallback(async (request) => {
    setLoading(true);
    setError(null);
    try {
      const result = await analyzeData(request);
      if (!result.success) {
        setError(result.error);
      }
      return result;
    } catch (e) {
      setError(e.message);
      return { success: false, error: e.message };
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchData = useCallback(async (table, options = {}) => {
    setLoading(true);
    try {
      const data = await fetchFromTable(table, options);
      return { success: true, data };
    } catch (e) {
      return { success: false, error: e.message };
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAllSystemData();
      return { success: true, data };
    } catch (e) {
      return { success: false, error: e.message };
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    sendMessage,
    analyze,
    fetchData,
    fetchAllData,
    loading,
    error
  };
}

export default useAI;
