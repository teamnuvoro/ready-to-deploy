-- Create users table for profiles
CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  phone TEXT,
  gender TEXT CHECK (gender IN ('male', 'female', 'other')),
  age INTEGER,
  premium_user BOOLEAN DEFAULT FALSE,
  message_count INTEGER DEFAULT 0,
  call_duration INTEGER DEFAULT 0,
  last_active TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create sessions table
CREATE TABLE IF NOT EXISTS public.sessions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('chat', 'call')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration INTEGER,
  quality_rating INTEGER CHECK (quality_rating BETWEEN 1 AND 5)
);

-- Create messages table
CREATE TABLE IF NOT EXISTS public.messages (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  session_id TEXT NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'ai')),
  tag TEXT DEFAULT 'general',
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users table
CREATE POLICY "Users can view their own profile"
  ON public.users FOR SELECT
  USING (id = current_setting('app.current_user_id', true));

CREATE POLICY "Users can update their own profile"
  ON public.users FOR UPDATE
  USING (id = current_setting('app.current_user_id', true));

CREATE POLICY "Anyone can insert users"
  ON public.users FOR INSERT
  WITH CHECK (true);

-- RLS Policies for sessions table
CREATE POLICY "Users can view their own sessions"
  ON public.sessions FOR SELECT
  USING (user_id = current_setting('app.current_user_id', true));

CREATE POLICY "Users can create their own sessions"
  ON public.sessions FOR INSERT
  WITH CHECK (user_id = current_setting('app.current_user_id', true));

CREATE POLICY "Users can update their own sessions"
  ON public.sessions FOR UPDATE
  USING (user_id = current_setting('app.current_user_id', true));

-- RLS Policies for messages table
CREATE POLICY "Users can view their own messages"
  ON public.messages FOR SELECT
  USING (user_id = current_setting('app.current_user_id', true));

CREATE POLICY "Users can create their own messages"
  ON public.messages FOR INSERT
  WITH CHECK (user_id = current_setting('app.current_user_id', true));

-- Create indexes for better performance
CREATE INDEX idx_sessions_user_id ON public.sessions(user_id);
CREATE INDEX idx_sessions_started_at ON public.sessions(started_at DESC);
CREATE INDEX idx_messages_session_id ON public.messages(session_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at);

-- Insert dev user for testing
INSERT INTO public.users (id, name, email, premium_user, gender, age)
VALUES ('dev-user-001', 'Dev User', 'dev@example.com', true, 'male', 25)
ON CONFLICT (id) DO NOTHING;