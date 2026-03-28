import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Activity, ShieldAlert, Clock, User, ShieldCheck, RefreshCw, Key, Settings } from 'lucide-react';

interface ModerationAction {
    timestamp: string;
    targetUser: string;
    channel: string;
    violation: boolean;
    reason: string;
    analysis: string;
}

interface AccessLog {
    timestamp: string;
    ip: string;
    success: boolean;
}

interface BotStats {
    totalEvaluations: number;
    totalViolations: number;
    totalTimeouts: number;
    uptime: number;
    lastActions: ModerationAction[];
    accessLogs: AccessLog[];
}

function App() {
    const [apiKey, setApiKey] = useState(localStorage.getItem('dashboard_key') || '');
    const [botUrl, setBotUrl] = useState(localStorage.getItem('bot_url') || 'http://localhost:3000');
    const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('dashboard_key'));
    const [stats, setStats] = useState<BotStats | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const fetchData = async () => {
        if (!apiKey) return;
        setLoading(true);
        try {
            const response = await axios.get(`${botUrl}/api/stats`, {
                headers: { 'x-api-key': apiKey }
            });
            setStats(response.data);
            setError('');
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to connect to bot.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isLoggedIn) {
            fetchData();
            const interval = setInterval(fetchData, 5000);
            return () => clearInterval(interval);
        }
    }, [isLoggedIn, botUrl, apiKey]);

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        localStorage.setItem('dashboard_key', apiKey);
        localStorage.setItem('bot_url', botUrl);
        setIsLoggedIn(true);
    };

    const handleLogout = () => {
        localStorage.removeItem('dashboard_key');
        setIsLoggedIn(false);
        setStats(null);
    };

    if (!isLoggedIn) {
        return (
            <div className="min-h-screen w-full bg-[#0f172a] flex items-center justify-center p-4">
                <div className="absolute inset-0 overflow-hidden">
                    <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-blue-500/10 blur-[120px] rounded-full"></div>
                    <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-purple-500/10 blur-[120px] rounded-full"></div>
                </div>

                <div className="glass w-full max-w-md p-8 rounded-3xl shadow-2xl relative z-10">
                    <div className="flex justify-center mb-6">
                        <div className="p-4 bg-blue-500/20 rounded-2xl">
                            <ShieldAlert className="w-10 h-10 text-blue-400" />
                        </div>
                    </div>
                    <h1 className="text-3xl font-bold text-center mb-2 text-white">Moderation++</h1>
                    <p className="text-slate-400 text-center mb-8">Secure AI Dashboard Access</p>
                    
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Bot API URL</label>
                            <div className="relative">
                                <Settings className="absolute left-3 top-3 w-5 h-5 text-slate-500" />
                                <input 
                                    type="text" 
                                    className="w-full bg-slate-900/50 border border-slate-700 rounded-xl py-2.5 pl-10 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                    value={botUrl}
                                    onChange={(e) => setBotUrl(e.target.value)}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">API Key</label>
                            <div className="relative">
                                <Key className="absolute left-3 top-3 w-5 h-5 text-slate-500" />
                                <input 
                                    type="password" 
                                    placeholder="Enter DASHBOARD_KEY"
                                    className="w-full bg-slate-900/50 border border-slate-700 rounded-xl py-2.5 pl-10 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                />
                            </div>
                        </div>
                        <button className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-500/25">
                            Access Dashboard
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen w-full bg-[#0f172a] text-slate-200 p-4 md:p-8">
            <div className="max-w-7xl mx-auto space-y-8">
                {/* Header */}
                <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass p-6 rounded-3xl">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-500/20 rounded-xl">
                            <ShieldCheck className="w-8 h-8 text-blue-400" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-white">Moderation++ AI Dashboard</h1>
                            <div className="flex items-center gap-2 text-sm text-slate-400">
                                <span className={`w-2 h-2 rounded-full ${stats ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
                                {stats ? `Connected: ${botUrl}` : 'Bot Offline'}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={fetchData} className="p-3 glass rounded-xl hover:bg-white/10 transition-colors">
                            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                        <button onClick={handleLogout} className="px-5 py-2.5 glass rounded-xl hover:bg-red-500/20 transition-colors text-red-400">
                            Logout
                        </button>
                    </div>
                </header>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <StatCard icon={<Activity className="text-blue-400" />} label="Total Evaluations" value={stats?.totalEvaluations ?? '--'} color="blue" />
                    <StatCard icon={<ShieldAlert className="text-orange-400" />} label="Violations Detected" value={stats?.totalViolations ?? '--'} color="orange" />
                    <StatCard icon={<Clock className="text-purple-400" />} label="Uptime" value={stats ? formatUptime(stats.uptime) : '--'} color="purple" />
                    <StatCard icon={<User className="text-green-400" />} label="Total Timeouts" value={stats?.totalTimeouts ?? '--'} color="green" />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Logs Table */}
                    <div className="lg:col-span-2 glass rounded-3xl overflow-hidden">
                        <div className="p-6 border-b border-white/5 flex items-center justify-between">
                            <h2 className="text-xl font-bold text-white">Moderation Logs</h2>
                            <span className="text-xs bg-white/5 px-3 py-1 rounded-full text-slate-400 uppercase tracking-wider">Live Feed</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-white/5 text-slate-400 text-xs uppercase">
                                    <tr>
                                        <th className="px-6 py-4">Timestamp</th>
                                        <th className="px-6 py-4">User</th>
                                        <th className="px-6 py-4">Channel</th>
                                        <th className="px-6 py-4">Result</th>
                                        <th className="px-6 py-4">Reason</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {stats?.lastActions.map((action, i) => (
                                        <tr key={i} className="hover:bg-white/5 transition-colors group cursor-help" title={action.analysis}>
                                            <td className="px-6 py-4 text-sm text-slate-500">{new Date(action.timestamp).toLocaleTimeString()}</td>
                                            <td className="px-6 py-4 font-medium text-slate-200">{action.targetUser}</td>
                                            <td className="px-6 py-4 text-slate-400">#{action.channel}</td>
                                            <td className="px-6 py-4">
                                                <span className={`px-3 py-1 rounded-lg text-xs font-bold ${action.violation ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
                                                    {action.violation ? 'VIOLATION' : 'CLEAN'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-slate-400 italic truncate max-w-xs">{action.reason}</td>
                                        </tr>
                                    ))}
                                    {stats?.lastActions.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-12 text-center text-slate-500">No recent moderation activity found.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Access Timeline */}
                    <div className="glass rounded-3xl p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-white">Access Timeline</h2>
                            <Key className="w-5 h-5 text-slate-500" />
                        </div>
                        <div className="space-y-6">
                            {stats?.accessLogs.map((log, i) => (
                                <div key={i} className="relative pl-6 border-l-2 border-white/5">
                                    <div className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-[#0f172a] ${log.success ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                    <div className="text-sm font-bold text-slate-200">{log.ip}</div>
                                    <div className="text-xs text-slate-500 flex items-center gap-2">
                                        <Clock className="w-3 h-3" />
                                        {new Date(log.timestamp).toLocaleString()}
                                    </div>
                                    <div className={`text-[10px] mt-1 font-bold uppercase tracking-widest ${log.success ? 'text-green-500/60' : 'text-red-500/60'}`}>
                                        {log.success ? 'Authorized Access' : 'Invalid API Key'}
                                    </div>
                                </div>
                            ))}
                            {stats?.accessLogs.length === 0 && (
                                <div className="text-center text-slate-500 py-8">No access logs recorded.</div>
                            )}
                        </div>
                    </div>
                </div>
                {error && <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl text-center">{error}</div>}
            </div>
        </div>
    );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode, label: string, value: string | number, color: string }) {
    const colors: Record<string, string> = {
        blue: 'bg-blue-500/20',
        orange: 'bg-orange-500/20',
        purple: 'bg-purple-500/20',
        green: 'bg-green-500/20'
    };

    return (
        <div className="glass p-6 rounded-3xl relative overflow-hidden group hover:scale-[1.02] transition-transform cursor-default">
            <div className={`absolute -top-4 -right-4 w-24 h-24 ${colors[color]} blur-3xl opacity-50 group-hover:opacity-100 transition-opacity`}></div>
            <div className="flex items-center gap-4 mb-4">
                <div className={`p-3 ${colors[color]} rounded-xl`}>{icon}</div>
                <div className="text-sm font-medium text-slate-400">{label}</div>
            </div>
            <div className="text-3xl font-bold text-white">{value}</div>
        </div>
    );
}

function formatUptime(seconds: number) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h}h ${m}m ${s}s`;
}

export default App;
