import { redirect } from 'next/navigation';

export default function NewProductRedirectPage() {
  redirect('/products?add=1');
}
