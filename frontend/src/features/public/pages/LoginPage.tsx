import { LoginForm } from '@/auth/LoginForm';

/** Direct-link fallback for /login; the header uses the same form in a dropdown. */
export default function LoginPage() {
  return (
    <section aria-labelledby="login-title" className="flex min-h-[80svh] items-start justify-center bg-sand px-5 pt-36 pb-24">
      <div className="w-full max-w-sm border border-line bg-chalk p-6 sm:p-8">
        <h1 id="login-title" className="display mb-6 text-3xl">
          Log in
        </h1>
        <LoginForm idPrefix="login-page" />
      </div>
    </section>
  );
}
