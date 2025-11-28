import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const userId = 'dev-user-001'; // Dev mode

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Set user context for RLS
    await supabase.rpc('set_config', {
      parameter: 'app.current_user_id',
      value: userId
    });

    // Find or create active session
    const { data: sessions, error: fetchError } = await supabase
      .from('sessions')
      .select('*')
      .eq('user_id', userId)
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1);

    if (fetchError) {
      console.error('[GetSession] Fetch error:', fetchError);
      throw fetchError;
    }

    let session;
    if (sessions && sessions.length > 0) {
      session = sessions[0];
    } else {
      // Create new session
      const { data: newSession, error: createError } = await supabase
        .from('sessions')
        .insert({
          user_id: userId,
          type: 'chat',
        })
        .select()
        .single();

      if (createError) {
        console.error('[GetSession] Create error:', createError);
        throw createError;
      }
      session = newSession;
    }

    return new Response(
      JSON.stringify(session),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('[GetSession] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to get session' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
