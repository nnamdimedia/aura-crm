import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  'https://vpqglsjocmqrsgsmetip.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwcWdsc2pvY21xcnNnc21ldGlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyNDkyNTMsImV4cCI6MjA5NzgyNTI1M30.zPnr72oc9aOsfomeFY7M8KqBSy68onvhfBxhBtrzwZs',
  {
    auth: {
      persistSession:    true,
      autoRefreshToken:  true,
      detectSessionInUrl: false,
    },
  }
);
