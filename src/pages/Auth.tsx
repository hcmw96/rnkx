import { FormEvent, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';

export default function Auth() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [displayName, setDisplayName] = useState('');
  const [age, setAge] = useState(30);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const title = useMemo(() => (mode === 'login' ? 'Log in' : 'Create account'), [mode]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    if (mode === 'login') {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(signInError.message);
      } else {
        navigate('/');
      }
      setLoading(false);
      return;
    }

    const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      const { error: athleteError } = await supabase.from('athletes').insert({
        id: data.user.id,
        display_name: displayName,
        age,
      });

      if (athleteError) {
        setError(athleteError.message);
      } else {
        navigate('/');
      }
    }

    setLoading(false);
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center p-6">
      <form onSubmit={onSubmit} className="w-full space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-6">
        <h1 className="text-xl font-bold text-white">{title}</h1>

        {mode === 'signup' && (
          <>
            <label className="block text-sm text-slate-300">
              Display name
              <input
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                required
              />
            </label>

            <label className="block text-sm text-slate-300">
              Age
              <input
                type="number"
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
                value={age}
                onChange={(event) => setAge(Number(event.target.value))}
                min={13}
                max={100}
                required
              />
            </label>
          </>
        )}

        <label className="block text-sm text-slate-300">
          Email
          <input
            type="email"
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>

        <label className="block text-sm text-slate-300">
          Password
          <input
            type="password"
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>

        {error && <p className="text-sm text-rose-300">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60"
        >
          {loading ? 'Please wait...' : title}
        </button>

        <button
          type="button"
          onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
          className="w-full text-sm text-slate-300 underline"
        >
          {mode === 'login' ? 'Need an account? Sign up' : 'Already have an account? Log in'}
        </button>
      </form>
    </main>
  );
}
