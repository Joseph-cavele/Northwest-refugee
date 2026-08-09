import type { Metadata } from 'next';
import ForgotPassword from '@/auth/screens/ForgotPassword';

export const metadata: Metadata = { title: 'Forgot password' };

export default function ForgotPasswordPage() {
  return <ForgotPassword />;
}
