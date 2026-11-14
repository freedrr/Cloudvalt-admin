/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { db } from './lib/firebase';
import { collection, getDocs } from 'firebase/firestore';

export default function App() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'users'));
        const usersData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setUsers(usersData);
      } catch (error) {
        console.error("Error fetching users: ", error);
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, []);

  if (loading) return <div className="min-h-screen bg-black text-white p-6">Loading...</div>;

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <header className="flex items-center gap-4 mb-8">
        <img src="/assets/aistudio/Screenshot_2026-11-11_201404_272a1524.png" alt="Cloudvalt Logo" className="w-12 h-12 rounded-lg border border-white" />
        <h1 className="text-3xl font-bold">Cloudvalt Admin</h1>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        <div className="p-6 rounded-lg border border-white">
          <h2 className="text-white/70 text-sm">Total users</h2>
          <p className="text-4xl font-bold mt-2">{users.length}</p>
        </div>
        <div className="p-6 rounded-lg border border-white">
          <h2 className="text-white/70 text-sm">Paid users</h2>
          <p className="text-4xl font-bold mt-2">{users.filter(u => u.payment === 'Paid').length}</p>
        </div>
        <div className="p-6 rounded-lg border border-white">
          <h2 className="text-white/70 text-sm">Free users</h2>
          <p className="text-4xl font-bold mt-2">{users.filter(u => u.payment === 'Free').length}</p>
        </div>
        <div className="p-6 rounded-lg border border-white">
          <h2 className="text-white/70 text-sm">Revenue</h2>
          <p className="text-4xl font-bold mt-2">$12,450</p>
        </div>
      </div>

      <section>
        <h2 className="text-2xl font-semibold mb-6">User records</h2>
        <div className="rounded-lg border border-white overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white">
                <th className="p-4">User</th>
                <th className="p-4">Plan</th>
                <th className="p-4">Images</th>
                <th className="p-4">Videos</th>
                <th className="p-4">Audio</th>
                <th className="p-4">Docs</th>
                <th className="p-4">Payment</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-white/20">
                  <td className="p-4">{user.name}</td>
                  <td className="p-4">{user.plan}</td>
                  <td className="p-4 text-white">{user.files?.images || 0}</td>
                  <td className="p-4 text-white">{user.files?.videos || 0}</td>
                  <td className="p-4 text-white">{user.files?.audio || 0}</td>
                  <td className="p-4 text-white">{user.files?.docs || 0}</td>
                  <td className="p-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${user.payment === 'Paid' ? 'bg-white text-black' : 'bg-black text-white border border-white'}`}>
                      {user.payment}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

