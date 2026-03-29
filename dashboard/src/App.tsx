import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Activity, ShieldAlert, Clock, User, ShieldCheck, 
    RefreshCw, Key, ChevronRight, 
    Terminal, LogOut, Search, X, 
    Cpu, Gavel, Timer,
    Users, UserPlus, Shield, Globe
} from 'lucide-react';

interface ModerationAction {
    timestamp: string;
    targetUser: string;
    targetRoles: string[];
    channel: string;
    violation: boolean;
    reason: string;
    analysis: string;
    socialProfile?: string;
    type: 'INFRACTION' | 'AUDIT' | 'NORMAL';
    auditData?: MassScanResult;
}

interface AccessLog {
    timestamp: string;
    ip: string;
    success: boolean;
}

interface AuthorizedUser {
    username: string;
    key: string;
    role: 'ADMIN' | 'MOD';
}

interface BotStats {
    totalEvaluations: number;
    totalViolations: number;
    totalTimeouts: number;
    uptime: number;
    lastActions: ModerationAction[];
    massScans: MassScanResult[];
    accessLogs: AccessLog[];
    isDev: boolean;
    role: string;
    guildId: string;
    defaultTimeout: number;
    authorizedUsers: AuthorizedUser[];
}

interface Member {
    tag: string;
    nickname: string | null;
    avatar: string;
    roles: string[];
    joinedAt: string;
    status: string;
}

interface UserSummary {
    userTag: string;
    userRoles: string[];
    behaviorSummary: string;
    violatedRules: string[];
    suggestedPunishment: string;
    riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
}

interface MassScanResult {
    timestamp: string;
    channel: string;
    totalMessages: number;
    usersAnalyzed: UserSummary[];
    generalConclusion: string;
}

interface Channel {
    id: string;
    name: string;
}

function App() {
    const [username, setUsername] = useState(sessionStorage.getItem('dashboard_user') || '');
    const [apiKey, setApiKey] = useState(sessionStorage.getItem('dashboard_key') || localStorage.getItem('dashboard_key') || '');
    const [botUrl, setBotUrl] = useState(localStorage.getItem('bot_url') || 'http://localhost:3000');
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [stats, setStats] = useState<BotStats | null>(null);
    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [selectedAction, setSelectedAction] = useState<ModerationAction | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState<'terminal' | 'members' | 'users'>('terminal');

    const [channels, setChannels] = useState<Channel[]>([]);
    const [selectedChannel, setSelectedChannel] = useState('');
    const [selectedGuild, setSelectedGuild] = useState('');
    const [scanning, setScanning] = useState(false);
    const [sessionTimeout, setSessionTimeout] = useState(10);

    const [newUser, setNewUser] = useState({ username: '', key: '', role: 'MOD' as const });

    const isDevMode = stats?.isDev || false;
    const isAdmin = stats?.role === 'ADMIN' || isDevMode;

    useEffect(() => {
        const loadConfig = async () => {
            try {
                const res = await axios.get('./config.json');
                if (res.data.bot_url && !localStorage.getItem('bot_url')) {
                    setBotUrl(res.data.bot_url);
                }
            } catch (e) {}
        };
        loadConfig();
    }, []);

    const fetchData = async () => {
        if (!apiKey || !username) return;
        setLoading(true);
        try {
            const response = await axios.get(`${botUrl}/api/stats`, {
                headers: { 'x-api-key': apiKey, 'x-username': username },
                params: { guildId: selectedGuild }
            });
            setStats(response.data);
            if (response.data.defaultTimeout && sessionTimeout === 10) {
                setSessionTimeout(response.data.defaultTimeout);
            }
            setError('');
            if (response.data.guildId && !selectedGuild) {
                setSelectedGuild(response.data.guildId);
            }
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to connect to bot.');
            if (err.response?.status === 401) setIsLoggedIn(false);
        } finally {
            setLoading(false);
        }
    };

    const fetchMembers = async () => {
        if (!apiKey || !isLoggedIn) return;
        try {
            const response = await axios.get(`${botUrl}/api/members`, {
                headers: { 'x-api-key': apiKey, 'x-username': username },
                params: { guildId: selectedGuild }
            });
            setMembers(response.data);
        } catch (err) {
            console.error('Failed to fetch members');
        }
    };

    const fetchChannels = async () => {
        if (!apiKey || !isLoggedIn) return;
        try {
            const response = await axios.get(`${botUrl}/api/channels`, {
                headers: { 'x-api-key': apiKey, 'x-username': username },
                params: { guildId: selectedGuild }
            });
            setChannels(response.data);
            if (response.data.length > 0 && !selectedChannel) {
                setSelectedChannel(response.data[0].id);
            }
        } catch (err) {
            console.error('Failed to fetch channels');
        }
    };

    const handleAddUser = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await axios.post(`${botUrl}/api/users/add`, 
                { newUsername: newUser.username, newKey: newUser.key, newRole: newUser.role, guildId: selectedGuild },
                { headers: { 'x-api-key': apiKey, 'x-username': username } }
            );
            alert(`User ${newUser.username} authorized successfully.`);
            setNewUser({ username: '', key: '', role: 'MOD' });
            fetchData();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to add user.');
        }
    };

    const handleMassScan = async () => {
        if (!selectedChannel) return;
        setScanning(true);
        try {
            await axios.post(`${botUrl}/api/mass-scan`, 
                { channelId: selectedChannel },
                { headers: { 'x-api-key': apiKey, 'x-username': username } }
            );
            fetchData();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Mass scan failed.');
        } finally {
            setScanning(false);
        }
    };

    const handleTimeout = async (userTag: string, minutesOverride?: number) => {
        const minutes = minutesOverride || sessionTimeout;
        if (!confirm(`Are you sure you want to issue a ${minutes}m timeout to ${userTag}?`)) return;
        try {
            await axios.post(`${botUrl}/api/timeout`, 
                { guildId: selectedGuild || stats?.guildId, userTag, minutes },
                { headers: { 'x-api-key': apiKey, 'x-username': username } }
            );
            alert(`Neural enforcement applied to ${userTag}.`);
            fetchData();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Timeout failed.');
        }
    };

    useEffect(() => {
        if (isLoggedIn) {
            fetchData();
            fetchChannels();
            if (activeTab === 'members') fetchMembers();
            const interval = setInterval(fetchData, 5000);
            return () => clearInterval(interval);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoggedIn, botUrl, apiKey, username, selectedGuild, isDevMode, activeTab]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!apiKey || !username) return;
        setLoading(true);
        setError('');
        try {
            const response = await axios.get(`${botUrl}/api/stats`, {
                headers: { 'x-api-key': apiKey, 'x-username': username }
            });
            if (response.data.isDev) localStorage.setItem('dashboard_key', apiKey);
            else sessionStorage.setItem('dashboard_key', apiKey);
            sessionStorage.setItem('dashboard_user', username);
            localStorage.setItem('bot_url', botUrl);
            setStats(response.data);
            setIsLoggedIn(true);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Invalid Identity or Bot Offline');
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('dashboard_key');
        sessionStorage.removeItem('dashboard_key');
        sessionStorage.removeItem('dashboard_user');
        setIsLoggedIn(false);
        setStats(null);
    };

    const unifiedHistory = useMemo(() => {
        const history = [...(stats?.lastActions || [])];
        const audits = (stats?.massScans || []).map(s => ({
            timestamp: s.timestamp,
            targetUser: 'COMMUNITY AUDIT',
            targetRoles: [],
            channel: s.channel,
            violation: true,
            reason: s.generalConclusion,
            analysis: '',
            type: 'AUDIT' as const,
            auditData: s
        }));
        history.push(...(audits as any));
        return history.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }, [stats]);

    const filteredHistory = useMemo(() => {
        return unifiedHistory.filter(a => 
            a.targetUser.toLowerCase().includes(searchTerm.toLowerCase()) ||
            a.reason.toLowerCase().includes(searchTerm.toLowerCase()) ||
            a.channel.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [unifiedHistory, searchTerm]);

    const themeColor = isDevMode ? 'red' : 'blue';

    if (!isLoggedIn) {
        return (
            <div className="min-h-screen w-full bg-[#020617] flex items-center justify-center p-4 selection:bg-blue-500/30">
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-blue-600/10 blur-[120px] rounded-full animate-pulse" />
                    <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-indigo-600/10 blur-[120px] rounded-full animate-pulse delay-700" />
                </div>
                <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass w-full max-w-md rounded-[2rem] border-white/10 shadow-2xl relative z-10 overflow-hidden">
                    <div className="p-8 md:p-10">
                        <div className="flex flex-col items-center mb-10">
                            <div className="p-4 bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl shadow-xl border border-white/10 mb-6 relative group">
                                <ShieldCheck className="w-8 h-8 text-white relative z-10" />
                                <div className="absolute inset-0 bg-blue-500/20 blur-xl group-hover:bg-blue-500/40 transition-all opacity-0 group-hover:opacity-100" />
                            </div>
                            <h1 className="text-3xl font-black tracking-tight text-white mb-2 italic uppercase">Moderation++</h1>
                            <p className="text-slate-500 font-bold text-[9px] uppercase tracking-[0.4em]">Neural Link Interface Access</p>
                        </div>
                        <form onSubmit={handleLogin} className="space-y-6">
                            <div className="space-y-2.5">
                                <label className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.25em] text-slate-500"><Globe className="w-3 h-3" />Bot API Gateway</label>
                                <input type="text" placeholder="https://your-bot-api.com" value={botUrl} onChange={(e) => setBotUrl(e.target.value)} className="w-full rounded-[1rem] py-4 px-5 text-sm text-white bg-white/5 border border-white/10 focus:outline-none focus:border-blue-500/50 transition-all" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2.5">
                                    <label className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.25em] text-slate-500"><Users className="w-3 h-3" />Username</label>
                                    <input type="text" placeholder="admin" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full rounded-[1rem] py-4 px-5 text-sm text-white bg-white/5 border border-white/10 focus:outline-none focus:border-blue-500/50 transition-all" />
                                </div>
                                <div className="space-y-2.5">
                                    <label className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.25em] text-slate-500"><Key className="w-3 h-3" />Neural Key</label>
                                    <input type="password" placeholder="••••••••" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="w-full rounded-[1rem] py-4 px-5 text-sm text-white bg-white/5 border border-white/10 focus:outline-none focus:border-blue-500/50 transition-all" />
                                </div>
                            </div>
                            <motion.button type="submit" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} className="relative w-full py-4 rounded-[1rem] font-black text-sm uppercase tracking-[0.25em] text-white overflow-hidden mt-4" style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 50%, #8b5cf6 100%)', boxShadow: '0 4px 30px rgba(99,102,241,0.35)' }}>
                                <span className="relative z-10 flex items-center justify-center gap-3">
                                    {loading ? <><RefreshCw className="w-4 h-4 animate-spin" /><span>Syncing...</span></> : <><span>Establish Link</span><ChevronRight className="w-4 h-4 opacity-70" /></>}
                                </span>
                            </motion.button>
                        </form>
                        {error && <p className="mt-6 text-center text-red-400 text-[10px] font-black uppercase tracking-widest bg-red-500/10 py-3 rounded-xl border border-red-500/20">{error}</p>}
                    </div>
                </motion.div>
            </div>
        );
    }

    return (
        <div className={`min-h-screen w-full bg-[#020617] text-slate-200 p-4 md:p-10 selection:bg-${themeColor}-500/30`}>
            <div className="max-w-[1600px] mx-auto space-y-8">
                <motion.header initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="flex flex-col md:flex-row md:items-center justify-between gap-6 glass p-8 rounded-[2rem]">
                    <div className="flex items-center gap-6">
                        <div className={`p-4 bg-gradient-to-tr ${isDevMode ? 'from-red-600 to-orange-600' : 'from-blue-600 to-indigo-600'} rounded-[1.5rem] shadow-lg border border-white/10`}>
                            {isDevMode ? <Cpu className="w-10 h-10 text-white" /> : <ShieldCheck className="w-10 h-10 text-white" />}
                        </div>
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-3xl font-black text-white leading-tight uppercase tracking-tighter italic">{isDevMode ? 'Developer Core' : 'Control Center'}</h1>
                                <span className={`px-2 py-0.5 bg-${themeColor}-500/10 border border-${themeColor}-500/20 rounded-md text-[10px] font-black text-${themeColor}-400 uppercase tracking-widest`}>{stats?.role} Identity</span>
                            </div>
                            <div className="flex items-center gap-3 text-sm font-medium text-slate-400 mt-1">
                                <span className={`flex h-2 w-2 rounded-full ${stats ? (isDevMode ? 'bg-red-500' : 'bg-green-500') : 'bg-red-500 animate-pulse'}`} />
                                <span className="opacity-80 font-black text-[10px] uppercase tracking-widest">Neural Link: {username}@{stats?.guildId}</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex bg-white/5 p-1.5 rounded-2xl border border-white/5">
                        <TabButton active={activeTab === 'terminal'} onClick={() => setActiveTab('terminal')} icon={<Terminal className="w-4 h-4" />} label="Terminal" color={themeColor} />
                        <TabButton active={activeTab === 'members'} onClick={() => setActiveTab('members')} icon={<Users className="w-4 h-4" />} label="Members" color={themeColor} />
                        {isAdmin && <TabButton active={activeTab === 'users'} onClick={() => setActiveTab('users')} icon={<Shield className="w-4 h-4" />} label="Identities" color={themeColor} />}
                    </div>
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-3 px-5 py-3 bg-white/5 rounded-2xl border border-white/5">
                            <Timer className={`w-4 h-4 text-${themeColor}-400`} />
                            <select value={sessionTimeout} onChange={(e) => setSessionTimeout(parseInt(e.target.value))} className="bg-transparent text-xs font-black uppercase text-white focus:outline-none cursor-pointer pr-2">
                                <option value="1" className="bg-slate-900">1m</option><option value="10" className="bg-slate-900">10m</option><option value="60" className="bg-slate-900">1h</option><option value="1440" className="bg-slate-900">24h</option>
                            </select>
                        </div>
                        <button onClick={handleLogout} className="flex items-center gap-3 px-6 py-4 glass hover:bg-red-500/10 border border-white/5 rounded-2xl transition-all text-slate-400 hover:text-red-400 font-black active:scale-95 uppercase tracking-[0.2em] text-[10px]">
                            <LogOut className="w-5 h-5" /><span>Sever Link</span>
                        </button>
                    </div>
                </motion.header>

                <AnimatePresence mode="wait">
                    {activeTab === 'terminal' && (
                        <motion.div key="terminal" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-8">
                            <div className="glass rounded-[2rem] overflow-hidden divide-y md:divide-y-0 md:divide-x divide-white/5 flex flex-col md:flex-row">
                                <StatsBarItem icon={<Activity className="w-5 h-5" />} label="Neural Decisions" value={stats?.totalEvaluations ?? '--'} color={themeColor} subtitle="TOTAL COMMUNITY TRAFFIC" />
                                <StatsBarItem icon={<ShieldAlert className="w-5 h-5" />} label="Malicious Risks" value={stats?.totalViolations ?? '--'} color="orange" subtitle="FILTERED INFRACTIONS" />
                                <StatsBarItem icon={<Clock className="w-5 h-5" />} label="Core Uptime" value={stats ? formatUptime(stats.uptime) : '--'} color="purple" subtitle="ACTIVE SESSION RUNTIME" />
                                <StatsBarItem icon={<User className="w-5 h-5" />} label="Punishments" value={stats?.totalTimeouts ?? '--'} color="green" subtitle="AUTHORIZED SERVER TIMEOUTS" />
                            </div>
                            <div className="grid grid-cols-1 xl:grid-cols-4 gap-10">
                                <div className="xl:col-span-3 glass rounded-[2.5rem] overflow-hidden flex flex-col min-h-[600px] border border-white/5 shadow-2xl">
                                    <div className="p-8 border-b border-white/5 flex flex-col space-y-6 bg-white/[0.01]">
                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                            <div className="flex items-center gap-4">
                                                <div className={`p-3 ${isDevMode ? 'bg-red-500/10' : 'bg-slate-800'} rounded-2xl`}><Terminal className={`w-6 h-6 ${isDevMode ? 'text-red-400' : 'text-blue-400'}`} /></div>
                                                <h2 className="text-2xl font-black text-white uppercase tracking-tighter italic">Neural Monitoring</h2>
                                            </div>
                                            <div className="relative group w-full md:w-80">
                                                <Search className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600 group-focus-within:${isDevMode ? 'text-red-400' : 'text-blue-400'}`} />
                                                <input type="text" placeholder="Filter neural history..." className={`w-full bg-slate-900/50 border border-white/5 rounded-[1.25rem] py-3 pl-12 pr-4 text-sm text-slate-300 focus:outline-none transition-all font-medium`} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                                            </div>
                                        </div>
                                        <div className={`flex flex-wrap items-center gap-4 p-4 ${isDevMode ? 'bg-red-500/5 border-red-500/10' : 'bg-blue-500/5 border-blue-500/10'} rounded-[1.5rem] border`}>
                                            <select value={selectedChannel} onChange={(e) => setSelectedChannel(e.target.value)} className="bg-slate-900/80 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none transition-all min-w-[180px] font-bold">
                                                {channels.map(c => <option key={c.id} value={c.id}>#{c.name.toUpperCase()}</option>)}
                                            </select>
                                            <button onClick={handleMassScan} disabled={scanning || !selectedChannel} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black transition-all active:scale-95 uppercase tracking-widest ${isDevMode ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500'} text-white shadow-lg`}>
                                                {scanning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}<span>{scanning ? 'Auditing Community...' : 'Run Mass Scan'}</span>
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex-1 overflow-x-auto custom-scrollbar p-4">
                                        <table className="w-full text-left border-separate border-spacing-y-2">
                                            <thead><tr className="text-slate-600 text-[9px] font-black uppercase tracking-[0.4em]"><th className="px-6 py-4">Identity</th><th className="px-6 py-4">Source</th><th className="px-6 py-4 text-center">Status</th><th className="px-6 py-4">Conclusion</th><th className="px-6 py-4"></th></tr></thead>
                                            <tbody>
                                                {filteredHistory.map((action, i) => (
                                                    <tr key={i} className="group glass hover:bg-white/5 transition-all cursor-pointer rounded-2xl overflow-hidden" onClick={() => setSelectedAction(action)}>
                                                        <td className="px-6 py-5 rounded-l-2xl"><div className="font-black text-sm text-white">{action.targetUser}</div><div className="text-[8px] font-black text-slate-600 uppercase mt-1">{new Date(action.timestamp).toLocaleTimeString()}</div></td>
                                                        <td className="px-6 py-5"><span className="text-[10px] font-black font-mono text-slate-500 uppercase">#{action.channel}</span></td>
                                                        <td className="px-6 py-5 text-center"><span className={`px-3 py-1 rounded-lg text-[8px] font-black tracking-widest border ${action.type === 'AUDIT' ? `bg-${themeColor}-500/10 text-${themeColor}-400 border-${themeColor}-500/20` : action.violation ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-green-500/10 text-green-400 border-green-500/20'}`}>{action.type === 'AUDIT' ? 'AUDIT' : action.violation ? 'RISK' : 'SECURE'}</span></td>
                                                        <td className="px-6 py-5 max-w-xs"><p className="text-xs italic line-clamp-1 font-bold text-slate-400">{action.reason}</p></td>
                                                        <td className="px-6 py-5 text-right rounded-r-2xl"><ChevronRight className="w-4 h-4 text-slate-700" /></td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                                <div className="glass rounded-[2.5rem] p-8 border border-white/5">
                                    <h2 className="text-xl font-black text-white uppercase mb-8 italic">System Entry</h2>
                                    <div className="space-y-6">
                                        {stats?.accessLogs.map((log, i) => (
                                            <div key={i} className="flex items-center justify-between p-4 bg-white/[0.02] rounded-2xl border border-white/5">
                                                <div><div className="text-[10px] font-black text-slate-300">{log.ip}</div><div className="text-[8px] font-black text-slate-600 mt-1 uppercase">{new Date(log.timestamp).toLocaleTimeString()}</div></div>
                                                <span className={`w-2 h-2 rounded-full ${log.success ? 'bg-green-500' : 'bg-red-500'}`} />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {activeTab === 'members' && (
                        <motion.div key="members" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="glass rounded-[2.5rem] p-10 border border-white/5 min-h-[700px]">
                            <div className="flex items-center justify-between mb-10">
                                <div className="flex items-center gap-4"><Users className={`w-8 h-8 text-${themeColor}-400`} /><h2 className="text-3xl font-black text-white uppercase italic tracking-tighter">Server Intercept</h2></div>
                                <div className="relative w-80"><Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600" /><input type="text" placeholder="Intercept member data..." className="w-full bg-slate-900/50 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-sm text-white focus:outline-none" /></div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
                                {members.map((m, i) => (
                                    <div key={i} className="glass p-6 rounded-3xl border border-white/5 group hover:border-white/20 transition-all flex flex-col gap-4 relative overflow-hidden">
                                        <div className="flex items-start justify-between relative z-10"><img src={m.avatar} className="w-14 h-14 rounded-2xl border-2 border-white/10 shadow-lg" alt="" /><button onClick={() => handleTimeout(m.tag)} className="p-3 glass rounded-2xl hover:bg-red-500/20 text-slate-600 hover:text-red-400 transition-all"><Gavel className="w-5 h-5" /></button></div>
                                        <div className="relative z-10"><div className="font-black text-white text-lg leading-tight truncate">{m.nickname || m.tag.split('#')[0]}</div><div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1">@{m.tag}</div></div>
                                        <div className="flex flex-wrap gap-1.5 mt-auto relative z-10">{m.roles.map((r, idx) => (<span key={idx} className="px-2 py-0.5 bg-white/5 rounded text-[8px] font-black text-slate-400 uppercase tracking-widest border border-white/5">{r}</span>))}</div>
                                        <div className={`absolute top-0 right-0 p-1 opacity-20 ${m.status === 'online' ? 'text-green-500' : 'text-slate-600'}`}><Activity className="w-32 h-32 -mr-16 -mt-16" /></div>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    )}

                    {activeTab === 'users' && isAdmin && (
                        <motion.div key="users" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                            <div className="lg:col-span-2 glass rounded-[2.5rem] p-10 border border-white/5">
                                <h2 className="text-3xl font-black text-white uppercase italic mb-10 flex items-center gap-4"><ShieldCheck className={`w-8 h-8 text-${themeColor}-400`} />Authorized Identities</h2>
                                <div className="space-y-4">
                                    {stats?.authorizedUsers.map((u, i) => (
                                        <div key={i} className="flex items-center justify-between p-6 glass rounded-2xl border border-white/5">
                                            <div className="flex items-center gap-6"><div className="p-3 bg-slate-900 rounded-xl"><User className="w-6 h-6 text-white" /></div><div><div className="font-black text-white text-lg">{u.username}</div><div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{u.role} CLEARANCE</div></div></div>
                                            <span className="px-4 py-1.5 bg-green-500/10 text-green-400 border border-green-500/20 rounded-lg text-[10px] font-black uppercase tracking-widest">Active</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="glass rounded-[2.5rem] p-10 border border-white/5">
                                <h2 className="text-xl font-black text-white uppercase italic mb-8 flex items-center gap-3"><UserPlus className="w-6 h-6 text-blue-400" />Authorize User</h2>
                                <form onSubmit={handleAddUser} className="space-y-6">
                                    <div className="space-y-2"><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Username</label><input type="text" value={newUser.username} onChange={(e) => setNewUser({...newUser, username: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white focus:outline-none" placeholder="e.g. jsmith" /></div>
                                    <div className="space-y-2"><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Access Key</label><input type="password" value={newUser.key} onChange={(e) => setNewUser({...newUser, key: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white focus:outline-none" placeholder="••••••••" /></div>
                                    <div className="space-y-2"><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Clearance</label><select value={newUser.role} onChange={(e) => setNewUser({...newUser, role: e.target.value as any})} className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white focus:outline-none"><option value="MOD" className="bg-slate-900">MODERATOR</option><option value="ADMIN" className="bg-slate-900">ADMINISTRATOR</option></select></div>
                                    <button type="submit" className="w-full py-4 bg-blue-600 hover:bg-blue-500 rounded-xl font-black text-white uppercase tracking-widest shadow-lg transition-all">Authorize Identity</button>
                                </form>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <AnimatePresence>
                {selectedAction && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setSelectedAction(null)} />
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass w-full max-w-2xl rounded-[2.5rem] p-10 relative z-10 border border-white/10 shadow-3xl">
                            <div className="flex items-center justify-between mb-10"><h3 className="text-3xl font-black text-white uppercase italic">Neural Analysis</h3><button onClick={() => setSelectedAction(null)} className="p-3 glass rounded-2xl text-slate-500"><X /></button></div>
                            <div className="space-y-8"><div className="p-8 bg-slate-900/50 rounded-3xl border border-white/5 italic text-slate-300 text-sm leading-relaxed">"{selectedAction.analysis}"</div><button onClick={() => handleTimeout(selectedAction.targetUser)} className="w-full py-5 bg-red-600 hover:bg-red-500 rounded-2xl font-black text-white uppercase tracking-widest flex items-center justify-center gap-4"><Gavel />Enforce {sessionTimeout}m Timeout</button></div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}

function StatsBarItem({ icon, label, value, color, subtitle }: any) {
    const textColors: any = { blue: 'text-blue-400', red: 'text-red-400', orange: 'text-orange-400', purple: 'text-purple-400', green: 'text-green-400' };
    return (
        <div className="flex-1 p-8 flex items-center gap-6 group hover:bg-white/[0.02] transition-all relative overflow-hidden">
            <div className={`p-3 bg-slate-900/50 rounded-2xl border border-white/5 ${textColors[color]} group-hover:scale-110 transition-transform duration-500`}>{icon}</div>
            <div><div className="flex items-baseline gap-3"><span className="text-2xl font-black text-white tracking-tight">{value}</span><span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</span></div><div className="text-[8px] font-black text-slate-600 uppercase mt-1 tracking-widest">{subtitle}</div></div>
            <div className={`absolute -right-4 -bottom-4 w-24 h-24 blur-3xl opacity-0 group-hover:opacity-20 transition-opacity bg-${color}-500`} />
        </div>
    );
}

function TabButton({ active, onClick, icon, label, color }: any) {
    return (
        <button onClick={onClick} className={`flex items-center gap-3 px-6 py-3 rounded-xl transition-all font-black uppercase text-[10px] tracking-widest ${active ? `bg-${color}-600 text-white shadow-lg` : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}>{icon}<span>{label}</span></button>
    );
}

function formatUptime(seconds: number) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h}H ${m}M ${s}S`;
}

export default App;
