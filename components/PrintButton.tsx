'use client';
import { Printer } from 'lucide-react';
export default function PrintButton() {
  return <button className="btn-outline" onClick={() => window.print()}><Printer className="h-4 w-4" />Print receipt</button>;
}
