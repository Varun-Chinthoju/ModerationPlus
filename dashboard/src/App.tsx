import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Activity, ShieldAlert, Clock, User, ShieldCheck, 
    RefreshCw, Key, ChevronRight, 
    Terminal, Lock, LogOut, Search, Info, X, FileSearch, Download,
    Cpu, Trash2, Database, AlertTriangle, Eye, Server, Gavel, Timer
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

interface BotStats {
    totalEvaluations: number;
    totalViolations: number;
    totalTimeouts: number;
    uptime: number;
    lastActions: ModerationAction[];
    massScans: MassScanResult[];
    accessLogs: AccessLog[];
    isDev: boolean;
    guildId: string;
    defaultTimeout: number; // ADDED: Backend provided default
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

interface PrivateMessage {
    id: string;
    author: string;
    roles: string[];
    content: string;
    timestamp: string;
}

interface PrivateFeedResult {
    channel: string;
    messages: PrivateMessage[];
}

interface Channel {
    id: string;
    name: string;
}

interface Guild {
    id: string;
    name: string;
    icon: string | null;
    memberCount: number;
}

function App() {
    const [apiKey, setApiKey] = useState(sessionStorage.getItem('dashboard_key') || localStorage.getItem('dashboard_key') || '');
    const [botUrl, setBotUrl] = useState(localStorage.getItem('bot_url') || 'http://localhost:3000');
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [stats, setStats] = useState<BotStats | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [selectedAction, setSelectedAction] = useState<ModerationAction | null>(null);
    const [selectedAudit, setSelectedAudit] = useState<MassScanResult | null>(null);
    const [privateFeed, setPrivateFeed] = useState<PrivateFeedResult | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    const [channels, setChannels] = useState<Channel[]>([]);
    const [guilds, setGuilds] = useState<Guild[]>([]);
    const [selectedChannel, setSelectedChannel] = useState('');
    const [selectedGuild, setSelectedGuild] = useState('');
    const [scanning, setScanning] = useState(false);
    
    // Configurable Timeout State
    const [sessionTimeout, setSessionTimeout] = useState(10);

    const isDevMode = stats?.isDev || false;

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
        if (!apiKey) return;
        setLoading(true);
        try {
            const response = await axios.get(`${botUrl}/api/stats`, {
                headers: { 'x-api-key': apiKey },
                params: { guildId: selectedGuild }
            });
            setStats(response.data);
            
            // Sync session timeout with server default if not manually changed
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

    const fetchChannels = async () => {
        if (!apiKey || !isLoggedIn) return;
        try {
            const response = await axios.get(`${botUrl}/api/channels`, {
                headers: { 'x-api-key': apiKey },
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

    const fetchGuilds = async () => {
        if (!apiKey || !isLoggedIn || !isDevMode) return;
        try {
            const response = await axios.get(`${botUrl}/api/dev/guilds`, {
                headers: { 'x-api-key': apiKey }
            });
            setGuilds(response.data);
        } catch (err) {}
    };

    const handleMassScan = async () => {
        if (!selectedChannel) return;
        setScanning(true);
        try {
            const response = await axios.post(`${botUrl}/api/mass-scan`, 
                { channelId: selectedChannel },
                { headers: { 'x-api-key': apiKey } }
            );
            setSelectedAudit(response.data);
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
                { headers: { 'x-api-key': apiKey } }
            );
            alert(`Neural enforcement applied to ${userTag}.`);
            fetchData();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Timeout failed.');
        }
    };

    const handlePrivateScan = async () => {
        if (!selectedChannel) return;
        setScanning(true);
        try {
            const response = await axios.post(`${botUrl}/api/dev/private-scan`, 
                { channelId: selectedChannel },
                { headers: { 'x-api-key': apiKey } }
            );
            setPrivateFeed(response.data);
        } catch (err: any) {
            alert(err.response?.data?.error || 'Private scan failed.');
        } finally {
            setScanning(false);
        }
    };

    const handleClearLogs = async (target: 'logs' | 'access') => {
        if (!confirm(`Are you sure you want to permanently delete all ${target === 'logs' ? 'neural monitored data' : 'system access logs'}?`)) return;

        try {
            await axios.delete(`${botUrl}/api/dev/clear`, {
                headers: { 'x-api-key': apiKey },
                data: { target, guildId: selectedGuild }
            });
            fetchData();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Clear failed.');
        }
    };

    const downloadReport = (audit: MassScanResult) => {
        const blob = new Blob([JSON.stringify(audit, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mass-scan-report-${audit.channel}-${new Date(audit.timestamp).toISOString()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    useEffect(() => {
        if (isLoggedIn) {
            fetchData();
            fetchChannels();
            if (isDevMode) fetchGuilds();
            const interval = setInterval(fetchData, 5000);
            return () => clearInterval(interval);
        }
    }, [isLoggedIn, botUrl, apiKey, selectedGuild, isDevMode]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!apiKey) return;
        
        setLoading(true);
        setError('');
        
        try {
            const response = await axios.get(`${botUrl}/api/stats`, {
                headers: { 'x-api-key': apiKey }
            });
            
            if (response.data.isDev) {
                localStorage.setItem('dashboard_key', apiKey);
            } else {
                sessionStorage.setItem('dashboard_key', apiKey);
            }
            localStorage.setItem('bot_url', botUrl);
            setStats(response.data);
            setIsLoggedIn(true);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Invalid Key or Bot Offline');
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('dashboard_key');
        sessionStorage.removeItem('dashboard_key');
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

        return history.sort((a, b) => 
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
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
                    <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-blue-600/10 blur-[120px] rounded-full animate-pulse"></div>
                    <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-indigo-600/10 blur-[120px] rounded-full animate-pulse delay-700"></div>
                </div>

                <motion.div 
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="glass w-full max-w-md rounded-[2rem] border-white/10 shadow-2xl relative z-10 overflow-hidden"
                >
                    <div className="p-8 md:p-10">
                        <div className="flex flex-col items-center mb-10">
                            <div className="p-4 bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl shadow-xl border border-white/10 mb-6 relative group">
                                <ShieldCheck className="w-8 h-8 text-white relative z-10" />
                                <div className="absolute inset-0 bg-blue-500/20 blur-xl group-hover:bg-blue-500/40 transition-all opacity-0 group-hover:opacity-100" />
                            </div>
                            <h1 className="text-3xl font-black tracking-tight text-white mb-2 italic uppercase">Moderation++</h1>
                            <p className="text-slate-500 font-bold text-[9px] uppercase tracking-[0.4em]">Neural Link Interface Access</p>
                        </div>
                        
                        <motion.form onSubmit={handleLogin} className="space-y-6">
                            {/* Server Gateway */}
                            <div className="space-y-2.5">
                                <label className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.25em]" style={{ color: 'rgba(148,163,184,0.5)' }}>
                                    <Server className="w-3 h-3" />
                                    Bot API Gateway
                                </label>
                                <div className="relative group">
                                    <input 
                                        type="text" 
                                        placeholder="https://your-bot-api.com"
                                        value={botUrl}
                                        onChange={(e) => setBotUrl(e.target.value)}
                                        className="w-full rounded-[1rem] py-4 px-5 text-sm text-white placeholder-slate-600 focus:outline-none transition-all duration-300"
                                        style={{
                                            background: 'rgba(255,255,255,0.04)',
                                            border: '1px solid rgba(255,255,255,0.08)',
                                        }}
                                        onFocus={e => {
                                            e.currentTarget.style.border = '1px solid rgba(59,130,246,0.5)';
                                            e.currentTarget.style.background = 'rgba(59,130,246,0.06)';
                                        }}
                                        onBlur={e => {
                                            e.currentTarget.style.border = '1px solid rgba(255,255,255,0.08)';
                                            e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                                        }}
                                    />
                                </div>
                            </div>

                            <div className="flex items-center gap-4 py-2">
                                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.05)' }} />
                                <div className="w-1 h-1 rounded-full bg-slate-800" />
                                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.05)' }} />
                            </div>

                            {/* Neural Access Key */}
                            <div className="space-y-2.5">
                                <label className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.25em]" style={{ color: 'rgba(148,163,184,0.5)' }}>
                                    <Lock className="w-3 h-3" />
                                    Neural Access Key
                                </label>
                                <div className="relative group">
                                    <input 
                                        type="password" 
                                        placeholder="Enter Token or Developer Key"
                                        value={apiKey}
                                        onChange={(e) => setApiKey(e.target.value)}
                                        className="w-full rounded-[1rem] py-4 px-5 text-sm text-white placeholder-slate-600 focus:outline-none transition-all duration-300"
                                        style={{
                                            background: 'rgba(255,255,255,0.04)',
                                            border: '1px solid rgba(255,255,255,0.08)',
                                        }}
                                        onFocus={e => {
                                            e.currentTarget.style.border = '1px solid rgba(139,92,246,0.5)';
                                            e.currentTarget.style.background = 'rgba(139,92,246,0.06)';
                                        }}
                                        onBlur={e => {
                                            e.currentTarget.style.border = '1px solid rgba(255,255,255,0.08)';
                                            e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Submit button */}
                            <motion.button 
                                type="submit"
                                whileHover={{ scale: 1.02, y: -2 }}
                                whileTap={{ scale: 0.97 }}
                                className="relative w-full py-4 rounded-[1rem] font-black text-sm uppercase tracking-[0.25em] text-white overflow-hidden mt-2"
                                style={{
                                    background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 50%, #8b5cf6 100%)',
                                    boxShadow: '0 4px 30px rgba(99,102,241,0.35), 0 0 0 1px rgba(255,255,255,0.1) inset'
                                }}
                            >
                                <span className="relative z-10 flex items-center justify-center gap-3">
                                    {loading 
                                        ? <><RefreshCw className="w-4 h-4 animate-spin" /><span>Syncing...</span></>
                                        : <><span>Sync Neural Link</span><ChevronRight className="w-4 h-4 opacity-70" /></>
                                    }
                                </span>
                            </motion.button>
                        </motion.form>
                        {error && <p className="mt-6 text-center text-red-400 text-[10px] font-black uppercase tracking-widest">{error}</p>}
                    </div>
                </motion.div>
            </div>
        );
    }

    return (
        <div className={`min-h-screen w-full bg-[#020617] text-slate-200 p-4 md:p-10 selection:bg-${themeColor}-500/30`}>
            <div className="max-w-[1600px] mx-auto space-y-8">
                {/* Header */}
                <motion.header 
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="flex flex-col md:flex-row md:items-center justify-between gap-6 glass p-8 rounded-[2rem]"
                >
                    <div className="flex items-center gap-6">
                        <div className={`p-4 bg-gradient-to-tr ${isDevMode ? 'from-red-600 to-orange-600' : 'from-blue-600 to-indigo-600'} rounded-[1.5rem] shadow-lg shadow-black/40 border border-white/10`}>
                            {isDevMode ? <Cpu className="w-10 h-10 text-white" /> : <ShieldCheck className="w-10 h-10 text-white" />}
                        </div>
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-3xl font-black text-white leading-tight uppercase tracking-tighter italic">
                                    {isDevMode ? 'Developer Core' : 'Control Center'}
                                </h1>
                                <span className={`px-2 py-0.5 bg-${themeColor}-500/10 border border-${themeColor}-500/20 rounded-md text-[10px] font-black text-${themeColor}-400 uppercase tracking-widest`}>
                                    {isDevMode ? 'DEV EDITION' : 'v1.0.2'}
                                </span>
                            </div>
                            <div className="flex items-center gap-3 text-sm font-medium text-slate-400 mt-1">
                                <span className={`flex h-2 w-2 rounded-full ${stats ? (isDevMode ? 'bg-red-500' : 'bg-green-500') : 'bg-red-500 animate-pulse'}`}></span>
                                <span className="opacity-80 font-black text-[10px] uppercase tracking-widest">Link Secured with {isDevMode ? 'Developer' : 'Standard'} Identity</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-6">
                        {/* THE CONFIGURABLE TIMEOUT PICKER */}
                        <div className="flex items-center gap-3 px-5 py-3 bg-white/5 rounded-2xl border border-white/5 group hover:border-white/10 transition-all">
                            <Timer className={`w-4 h-4 text-${themeColor}-400`} />
                            <div className="flex flex-col">
                                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Gavel Duration</span>
                                <select 
                                    value={sessionTimeout}
                                    onChange={(e) => setSessionTimeout(parseInt(e.target.value))}
                                    className="bg-transparent text-xs font-black uppercase text-white focus:outline-none cursor-pointer pr-2"
                                >
                                    <option value="1" className="bg-slate-900">1 Minute</option>
                                    <option value="5" className="bg-slate-900">5 Minutes</option>
                                    <option value="10" className="bg-slate-900">10 Minutes</option>
                                    <option value="30" className="bg-slate-900">30 Minutes</option>
                                    <option value="60" className="bg-slate-900">1 Hour</option>
                                    <option value="1440" className="bg-slate-900">24 Hours</option>
                                    <option value="10080" className="bg-slate-900">1 Week</option>
                                </select>
                            </div>
                        </div>

                        {isDevMode && guilds.length > 0 && (
                            <div className="flex items-center gap-3 px-4 py-2 bg-white/5 rounded-2xl border border-white/5">
                                <Server className="w-4 h-4 text-red-400" />
                                <select 
                                    value={selectedGuild}
                                    onChange={(e) => setSelectedGuild(e.target.value)}
                                    className="bg-transparent text-xs font-black uppercase text-white focus:outline-none cursor-pointer pr-4"
                                >
                                    {guilds.map(g => (
                                        <option key={g.id} value={g.id} className="bg-slate-900 text-white">{g.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <button onClick={fetchData} className="p-4 glass rounded-2xl hover:bg-white/5 transition-all active:scale-95 group border border-white/5">
                            <RefreshCw className={`w-6 h-6 text-slate-400 group-hover:text-${themeColor}-400 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                        <button onClick={handleLogout} className="flex items-center gap-3 px-6 py-4 glass hover:bg-red-500/10 border border-white/5 rounded-2xl transition-all text-slate-400 hover:text-red-400 font-black active:scale-95 uppercase tracking-[0.2em] text-[10px]">
                            <LogOut className="w-5 h-5" />
                            <span>Sever Link</span>
                        </button>
                    </div>
                </motion.header>

                {/* Stats Bar */}
                <motion.div 
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.1 }}
                    className="glass rounded-[2rem] overflow-hidden divide-y md:divide-y-0 md:divide-x divide-white/5 flex flex-col md:flex-row"
                >
                    <StatsBarItem icon={<Activity className="w-5 h-5" />} label="Neural Decisions" value={stats?.totalEvaluations ?? '--'} color={themeColor} subtitle="TOTAL COMMUNITY TRAFFIC" />
                    <StatsBarItem icon={<ShieldAlert className="w-5 h-5" />} label="Malicious Risks" value={stats?.totalViolations ?? '--'} color="orange" subtitle="FILTERED INFRACTIONS" />
                    <StatsBarItem icon={<Clock className="w-5 h-5" />} label="Core Uptime" value={stats ? formatUptime(stats.uptime) : '--'} color="purple" subtitle="ACTIVE SESSION RUNTIME" />
                    <StatsBarItem icon={<User className="w-5 h-5" />} label="Punishments" value={stats?.totalTimeouts ?? '--'} color="green" subtitle="AUTHORIZED SERVER TIMEOUTS" />
                </motion.div>

                {/* Developer Command Console */}
                {isDevMode && (
                    <motion.div 
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="glass border-red-500/20 p-8 rounded-[2.5rem] bg-red-500/5 relative overflow-hidden"
                    >
                        <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none">
                            <AlertTriangle className="w-64 h-64 text-red-500" />
                        </div>
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 relative z-10">
                            <div className="flex items-center gap-6">
                                <div className="p-4 bg-red-500/20 rounded-2xl border border-red-500/30">
                                    <Database className="w-8 h-8 text-red-400" />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-black text-red-400 uppercase tracking-tighter italic">VULCAN Command Center</h2>
                                    <p className="text-red-200/50 font-bold text-xs uppercase tracking-widest">Privileged Data Management • All actions are permanent</p>
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-4">
                                <button 
                                    onClick={handlePrivateScan}
                                    disabled={scanning || !selectedChannel}
                                    className="flex items-center gap-3 px-8 py-4 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-2xl font-black transition-all active:scale-95 uppercase tracking-widest text-xs border border-white/10"
                                >
                                    <Eye className="w-5 h-5 text-red-400" />
                                    <span>Neural Live Feed</span>
                                </button>
                                <button 
                                    onClick={() => handleClearLogs('logs')}
                                    className="flex items-center gap-3 px-8 py-4 bg-red-600 hover:bg-red-500 text-white rounded-2xl font-black transition-all shadow-lg shadow-red-500/20 active:scale-95 uppercase tracking-widest text-xs"
                                >
                                    <Trash2 className="w-5 h-5" />
                                    <span>Purge Neural History</span>
                                </button>
                                <button 
                                    onClick={() => handleClearLogs('access')}
                                    className="flex items-center gap-3 px-8 py-4 border-2 border-red-500/30 hover:bg-red-500/10 text-red-400 rounded-2xl font-black transition-all active:scale-95 uppercase tracking-widest text-xs"
                                >
                                    <X className="w-5 h-5" />
                                    <span>Reset Entry Logs</span>
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}

                <div className="grid grid-cols-1 xl:grid-cols-4 gap-10">
                    {/* Neural Monitoring Terminal */}
                    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }} className="xl:col-span-3 glass rounded-[2.5rem] overflow-hidden flex flex-col min-h-[600px] border border-white/5 shadow-2xl">
                        <div className="p-8 border-b border-white/5 flex flex-col space-y-6 bg-white/[0.01]">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                <div className="flex items-center gap-4">
                                    <div className={`p-3 ${isDevMode ? 'bg-red-500/10' : 'bg-slate-800'} rounded-2xl`}>
                                        <Terminal className={`w-6 h-6 ${isDevMode ? 'text-red-400' : 'text-blue-400'}`} />
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <h2 className="text-2xl font-black text-white uppercase tracking-tighter italic">Neural Monitoring</h2>
                                        <span className={`flex h-2 w-2 rounded-full ${isDevMode ? 'bg-red-500' : 'bg-blue-500'} animate-ping`}></span>
                                    </div>
                                </div>
                                <div className="relative group w-full md:w-80">
                                    <Search className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600 group-focus-within:${isDevMode ? 'text-red-400' : 'text-blue-400'}`} />
                                    <input type="text" placeholder="Filter neural history..." className={`w-full bg-slate-900/50 border border-white/5 rounded-[1.25rem] py-3 pl-12 pr-4 text-sm text-slate-300 focus:outline-none focus:border-${themeColor}-500/30 transition-all font-medium`} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                                </div>
                            </div>

                            {/* Neural Audit Tool */}
                            <div className={`flex flex-wrap items-center gap-4 p-4 ${isDevMode ? 'bg-red-500/5 border-red-500/10' : 'bg-blue-500/5 border-blue-500/10'} rounded-[1.5rem] border`}>
                                <div className="flex items-center gap-3 px-4 py-2 border-r border-white/10 mr-2">
                                    <FileSearch className={`w-5 h-5 ${isDevMode ? 'text-red-400' : 'text-blue-400'}`} />
                                    <span className={`text-[10px] font-black ${isDevMode ? 'text-red-400' : 'text-blue-400'} uppercase tracking-[0.2em]`}>Neural Audit Tool</span>
                                </div>
                                <select value={selectedChannel} onChange={(e) => setSelectedChannel(e.target.value)} className="bg-slate-900/80 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none transition-all min-w-[180px] font-bold">
                                    <option value="" disabled>Select Channel Target</option>
                                    {channels.map(c => <option key={c.id} value={c.id}>#{c.name.toUpperCase()}</option>)}
                                </select>
                                <button onClick={handleMassScan} disabled={scanning || !selectedChannel} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black transition-all active:scale-95 uppercase tracking-widest ${isDevMode ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500'} text-white shadow-lg shadow-${themeColor}-500/20`}>
                                    {scanning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
                                    <span>{scanning ? 'Auditing Community...' : 'Run Mass Scan'}</span>
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-x-auto custom-scrollbar">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="text-slate-600 text-[9px] font-black uppercase tracking-[0.4em] border-b border-white/5">
                                        <th className="px-8 py-6">Intelligence Identity</th>
                                        {isDevMode && <th className="px-8 py-6">Hierarchy</th>}
                                        <th className="px-8 py-6">Source</th>
                                        <th className="px-8 py-6 text-center">Status</th>
                                        <th className="px-8 py-6">Conclusion</th>
                                        <th className="px-8 py-6"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/[0.02]">
                                    <AnimatePresence mode='popLayout'>
                                        {filteredHistory.map((action, i) => (
                                            <motion.tr key={action.timestamp + i} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={`group hover:bg-white/[0.02] transition-all cursor-pointer ${action.type === 'AUDIT' ? (isDevMode ? 'bg-red-500/5' : 'bg-blue-500/5') : ''}`} onClick={() => action.type === 'AUDIT' ? setSelectedAudit(action.auditData!) : setSelectedAction(action)}>
                                                <td className="px-8 py-6">
                                                    <div className={`font-black tracking-tight transition-colors text-sm ${action.type === 'AUDIT' ? (isDevMode ? 'text-red-400' : 'text-blue-400') : (action.type === 'NORMAL' ? 'text-slate-400' : 'text-slate-200 group-hover:text-white')}`}>{action.targetUser}</div>
                                                    <div className="text-[9px] font-black text-slate-600 mt-1 uppercase tracking-widest">{new Date(action.timestamp).toLocaleString()}</div>
                                                </td>
                                                {isDevMode && (
                                                    <td className="px-8 py-6">
                                                        <div className="flex flex-wrap gap-1 max-w-[150px]">
                                                            {action.targetRoles && action.targetRoles.length > 0 ? action.targetRoles.map((role, idx) => <span key={idx} className="px-2 py-0.5 bg-white/5 rounded text-[8px] font-black text-slate-500 uppercase tracking-tighter border border-white/5">{role}</span>) : <span className="text-[8px] text-slate-700 uppercase font-black tracking-widest">Guest</span>}
                                                        </div>
                                                    </td>
                                                )}
                                                <td className="px-8 py-6">
                                                    <span className="px-3 py-1 bg-slate-900 rounded-lg text-[9px] font-black text-slate-500 border border-white/5">#{action.channel.toUpperCase()}</span>
                                                </td>
                                                <td className="px-8 py-6">
                                                    <div className="flex justify-center">
                                                        <span className={`px-4 py-1.5 rounded-lg text-[8px] font-black tracking-[0.3em] border ${
                                                            action.type === 'AUDIT' ? `bg-${themeColor}-500/10 text-${themeColor}-400 border-${themeColor}-500/20` : 
                                                            action.type === 'NORMAL' ? 'bg-slate-800/50 text-slate-500 border-slate-800' :
                                                            action.violation ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-green-500/10 text-green-400 border-green-500/20'
                                                        }`}>
                                                            {action.type === 'AUDIT' ? 'COMMUNITY AUDIT' : action.type === 'NORMAL' ? 'NEURAL PROFILE' : action.violation ? 'MALICIOUS' : 'SECURE'}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6 max-w-xs">
                                                    <p className={`text-xs italic line-clamp-1 font-bold ${action.type === 'AUDIT' ? (isDevMode ? 'text-red-200' : 'text-blue-200') : (action.type === 'NORMAL' ? 'text-slate-500' : 'text-slate-400 group-hover:text-slate-300')}`}>
                                                        {action.reason}
                                                    </p>
                                                </td>
                                                <td className="px-8 py-6 text-right">
                                                    <div className="flex items-center justify-end gap-3">
                                                        {action.type !== 'AUDIT' && (
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); handleTimeout(action.targetUser); }}
                                                                className="p-2.5 glass rounded-xl hover:bg-red-500/20 text-slate-700 hover:text-red-400 transition-all opacity-0 group-hover:opacity-100 border border-white/5"
                                                                title={`Enforce ${sessionTimeout}m Timeout`}
                                                            >
                                                                <Gavel className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                        <ChevronRight className={`w-5 h-5 text-slate-800 group-hover:${isDevMode ? 'text-red-400' : 'text-blue-400'} transition-all inline-block group-hover:translate-x-1`} />
                                                    </div>
                                                </td>
                                            </motion.tr>
                                        ))}
                                    </AnimatePresence>
                                </tbody>
                            </table>
                        </div>
                    </motion.div>

                    {/* Entry Logs */}
                    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }} className="glass rounded-[2.5rem] p-8 border border-white/5 shadow-xl">
                        <div className="flex items-center gap-4 mb-10">
                            <div className={`p-3 ${isDevMode ? 'bg-red-500/10' : 'bg-indigo-500/10'} rounded-2xl`}>
                                <Key className={`w-6 h-6 ${isDevMode ? 'text-red-400' : 'text-indigo-400'}`} />
                            </div>
                            <h2 className="text-xl font-black text-white uppercase tracking-tighter italic">System Entry</h2>
                        </div>
                        <div className="space-y-8 relative">
                            <div className="absolute left-[11px] top-2 bottom-2 w-px bg-white/5"></div>
                            {stats?.accessLogs.map((log, i) => (
                                <div key={i} className="relative pl-10">
                                    <div className={`absolute left-0 top-1.5 w-[23px] h-[23px] rounded-full border-4 border-[#020617] z-10 ${log.success ? (isDevMode ? 'bg-red-500' : 'bg-green-500') : 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.4)]'}`}></div>
                                    <div className="font-black text-xs text-slate-300 tracking-tight">{log.ip}</div>
                                    <div className="text-[9px] font-black text-slate-600 flex items-center gap-2 mt-1 uppercase tracking-widest"><Clock className="w-3 h-3" />{new Date(log.timestamp).toLocaleTimeString()}</div>
                                    <div className={`text-[9px] mt-2 font-black uppercase tracking-[0.2em] ${log.success ? (isDevMode ? 'text-red-500/50' : 'text-green-500/50') : 'text-red-500/70'}`}>{log.success ? 'AUTHORIZED' : 'DENIED'}</div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                </div>
            </div>

            {/* Infraction / Profile Modal */}
            <AnimatePresence>
                {selectedAction && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setSelectedAction(null)} />
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="glass w-full max-w-2xl rounded-[2.5rem] overflow-hidden relative z-10 border border-white/10 shadow-3xl">
                            <div className="p-10 space-y-8">
                                <div className="flex items-start justify-between">
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-3">
                                            <span className={`w-3 h-3 rounded-full ${selectedAction.type === 'NORMAL' ? 'bg-slate-500' : (selectedAction.violation ? 'bg-red-500' : 'bg-green-500')}`}></span>
                                            <h3 className="text-3xl font-black text-white uppercase tracking-tighter italic">
                                                {selectedAction.type === 'NORMAL' ? 'Neural Profile' : 'Neural Intelligence'}
                                            </h3>
                                        </div>
                                        <div className="flex items-center gap-3 mt-2">
                                            <p className="text-slate-500 font-bold text-sm uppercase tracking-widest">Identity: <span className={isDevMode ? 'text-red-400' : 'text-blue-400'}>@{selectedAction.targetUser}</span></p>
                                            {isDevMode && (
                                                <div className="flex gap-1">
                                                    {selectedAction.targetRoles.map((r, idx) => <span key={idx} className="px-2 py-0.5 bg-white/5 rounded text-[8px] font-black text-slate-600 border border-white/5 uppercase">{r}</span>)}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <button onClick={() => setSelectedAction(null)} className="p-3 glass rounded-2xl hover:bg-white/10 transition-colors border border-white/5"><X className="w-6 h-6 text-slate-400" /></button>
                                </div>
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="glass p-6 rounded-3xl bg-white/[0.02] border border-white/5">
                                        <div className="text-[10px] font-black text-slate-600 uppercase mb-2 tracking-[0.2em]">Status</div>
                                        <div className={`text-xl font-black uppercase tracking-tight ${selectedAction.type === 'NORMAL' ? 'text-slate-400' : (selectedAction.violation ? 'text-red-400' : 'text-green-400')}`}>
                                            {selectedAction.type === 'NORMAL' ? 'Behavior Sync' : (selectedAction.violation ? 'Risk Detected' : 'Safety Verified')}
                                        </div>
                                    </div>
                                    <div className="glass p-6 rounded-3xl bg-white/[0.02] border border-white/5">
                                        <div className="text-[10px] font-black text-slate-600 uppercase mb-2 tracking-[0.2em]">Source Method</div>
                                        <div className="text-xl font-black text-white uppercase tracking-tight italic">{selectedAction.type === 'NORMAL' ? 'Proactive' : 'Triggered'}</div>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 text-[10px] font-black text-slate-600 uppercase tracking-[0.3em]"><Info className="w-4 h-4" /><span>{selectedAction.type === 'NORMAL' ? 'Social Behavior Profile' : 'Contextual Reasoning'}</span></div>
                                    <div className="glass p-8 rounded-[2rem] text-slate-300 leading-relaxed font-bold italic bg-slate-900/40 text-sm border border-white/5">
                                        "{selectedAction.type === 'NORMAL' ? selectedAction.socialProfile : selectedAction.analysis}"
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <button onClick={() => handleTimeout(selectedAction.targetUser)} className="flex-1 bg-red-600 hover:bg-red-500 py-5 rounded-2xl font-black transition-all text-white uppercase tracking-widest text-xs shadow-lg shadow-red-500/20 flex items-center justify-center gap-3"><Gavel className="w-5 h-5" /><span>Enforce {sessionTimeout}m Timeout</span></button>
                                    <button onClick={() => setSelectedAction(null)} className="flex-1 glass hover:bg-white/5 py-5 rounded-2xl font-black transition-all text-slate-400 uppercase tracking-widest text-xs border border-white/5">Dismiss Report</button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Audit Modal */}
            <AnimatePresence>
                {selectedAudit && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/90 backdrop-blur-xl" onClick={() => setSelectedAudit(null)} />
                        <motion.div initial={{ scale: 0.9, y: 40 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 40 }} className="glass w-full max-w-[95vw] max-h-[95vh] rounded-[3rem] overflow-hidden relative z-10 border border-white/10 shadow-3xl flex flex-col">
                            <div className="p-10 border-b border-white/5 flex items-start justify-between bg-white/[0.02]">
                                <div className="flex items-center gap-6">
                                    <div className={`p-4 bg-${themeColor}-500/20 rounded-2xl border border-${themeColor}-500/20`}><FileSearch className={`w-10 h-10 text-${themeColor}-400`} /></div>
                                    <div>
                                        <h3 className="text-4xl font-black text-white uppercase tracking-tighter italic">Community Neural Audit</h3>
                                        <p className="text-slate-500 font-bold uppercase tracking-widest text-xs mt-1">Channel: <span className={`text-${themeColor}-400`}>#{selectedAudit.channel.toUpperCase()}</span> • Dataset: {selectedAudit.totalMessages} Neural Nodes</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <button onClick={() => downloadReport(selectedAudit)} className={`flex items-center gap-3 px-8 py-4 bg-${themeColor}-600 hover:bg-${themeColor}-500 text-white rounded-2xl font-black transition-all shadow-lg shadow-${themeColor}-500/20 active:scale-95 uppercase tracking-widest text-xs`}><Download className="w-5 h-5" /><span>Export Manifest</span></button>
                                    <button onClick={() => setSelectedAudit(null)} className="p-4 glass rounded-2xl hover:bg-white/10 transition-colors border border-white/5"><X className="w-8 h-8 text-slate-400" /></button>
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto p-10 space-y-10 custom-scrollbar">
                                <div className={`glass p-10 rounded-[3rem] ${isDevMode ? 'bg-red-500/5 border-red-500/20' : 'bg-blue-500/5 border-blue-500/20'} border-2`}>
                                    <div className="flex items-center gap-3 mb-6"><Activity className={`w-6 h-6 ${isDevMode ? 'text-red-400' : 'text-blue-400'}`} /><h4 className={`text-[10px] font-black ${isDevMode ? 'text-red-400' : 'text-blue-400'} uppercase tracking-[0.4em]`}>Executive Core Intelligence</h4></div>
                                    <p className="text-3xl text-slate-100 font-black leading-tight italic tracking-tight">"{selectedAudit.generalConclusion}"</p>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-4 gap-8">
                                    {selectedAudit.usersAnalyzed.map((user, i) => (
                                        <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="glass p-8 rounded-[2.5rem] border border-white/5 hover:border-white/10 transition-all group flex flex-col h-full bg-white/[0.01]">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className={`font-black text-xl text-white group-hover:text-${themeColor}-400 transition-colors tracking-tighter`}>{user.userTag}</div>
                                                <span className={`px-4 py-1.5 rounded-xl text-[9px] font-black tracking-[0.2em] border ${
                                                    user.riskLevel === 'Critical' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                                                    user.riskLevel === 'High' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' :
                                                    user.riskLevel === 'Medium' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
                                                    'bg-green-500/20 text-green-400 border-green-500/20'
                                                }`}>
                                                    {user.riskLevel} RISK
                                                </span>
                                            </div>
                                            {isDevMode && (
                                                <div className="flex flex-wrap gap-1 mb-6">{user.userRoles && user.userRoles.map((r, idx) => <span key={idx} className="text-[8px] font-black text-slate-600 uppercase tracking-widest">{r}</span>)}</div>
                                            )}
                                            <p className="text-slate-400 text-sm font-bold leading-relaxed mb-8 flex-1 italic">"{user.behaviorSummary}"</p>
                                            <div className="space-y-6 pt-6 border-t border-white/5 mt-auto">
                                                <div className="flex flex-wrap gap-2">{user.violatedRules.length > 0 ? user.violatedRules.map((rule, j) => <span key={j} className="px-3 py-1 bg-red-500/10 rounded-lg text-[9px] text-red-400 font-black border border-red-500/10 uppercase tracking-widest">{rule}</span>) : <span className="px-3 py-1 bg-green-500/10 rounded-lg text-[9px] text-green-400 font-black border border-green-500/10 uppercase tracking-widest">CLEAR</span>}</div>
                                                <div className="flex gap-2">
                                                    <button onClick={() => handleTimeout(user.userTag)} className="flex-1 bg-red-600 hover:bg-red-500 py-3 rounded-xl font-black transition-all text-white uppercase tracking-widest text-[8px] flex items-center justify-center gap-2 shadow-lg shadow-red-500/10"><Gavel className="w-3 h-3" /><span>Timeout</span></button>
                                                    <div className="flex-1 space-y-1"><div className="text-[7px] font-black text-slate-600 uppercase tracking-[0.3em]">Protocol</div><div className="text-[10px] font-black text-slate-200 bg-black/40 p-2 rounded-lg border border-white/5 uppercase tracking-tighter truncate italic text-center">{user.suggestedPunishment}</div></div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Private Feed Modal */}
            <AnimatePresence>
                {privateFeed && (
                    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/90 backdrop-blur-2xl" onClick={() => setPrivateFeed(null)} />
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="glass w-full max-w-4xl max-h-[85vh] rounded-[3rem] overflow-hidden relative z-10 border border-red-500/20 shadow-3xl flex flex-col bg-[#050000]">
                            <div className="p-8 border-b border-white/5 flex items-center justify-between bg-red-500/5">
                                <div className="flex items-center gap-4">
                                    <Eye className="w-8 h-8 text-red-500" />
                                    <div>
                                        <h3 className="text-2xl font-black text-white uppercase tracking-tighter italic">Private Neural Feed</h3>
                                        <p className="text-red-500/50 font-bold uppercase tracking-widest text-[10px]">Real-time intercept • #{privateFeed.channel.toUpperCase()}</p>
                                    </div>
                                </div>
                                <button onClick={() => setPrivateFeed(null)} className="p-3 hover:bg-white/5 rounded-2xl transition-colors border border-white/5"><X className="w-6 h-6 text-slate-500" /></button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-8 space-y-4 custom-scrollbar font-mono text-sm">
                                {privateFeed.messages.map((m, i) => (
                                    <div key={i} className="group border-l-2 border-white/5 pl-4 hover:border-red-500/30 transition-colors py-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-red-500 font-black">[{new Date(m.timestamp).toLocaleTimeString()}]</span>
                                            <span className="text-white font-black">{m.author}</span>
                                            <span className="text-slate-600 text-[10px] uppercase">({m.roles.join(', ') || 'Guest'})</span>
                                        </div>
                                        <p className="text-slate-400 group-hover:text-slate-200 transition-colors leading-relaxed">{m.content}</p>
                                    </div>
                                ))}
                            </div>
                            <div className="p-4 bg-red-500/10 text-center text-[9px] font-black text-red-500 uppercase tracking-[0.5em]">Secret Intercept • No Logs Stored</div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}

function StatsBarItem({ icon, label, value, color, subtitle }: { icon: React.ReactElement, label: string, value: string | number, color: string, subtitle: string }) {
    const textColors = {
        blue: 'text-blue-400',
        red: 'text-red-400',
        orange: 'text-orange-400',
        purple: 'text-purple-400',
        green: 'text-green-400',
    };

    return (
        <div className="flex-1 p-8 flex items-center gap-6 group hover:bg-white/[0.02] transition-colors relative overflow-hidden">
            <div className={`p-3 bg-slate-900/50 rounded-2xl border border-white/5 ${(textColors as any)[color]} group-hover:scale-110 transition-transform duration-500`}>
                {icon}
            </div>
            <div className="flex flex-col">
                <div className="flex items-baseline gap-3">
                    <span className="text-2xl font-black text-white tracking-tight">{value}</span>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</span>
                </div>
                <span className="text-[8px] font-black text-slate-600 uppercase tracking-[0.2em] mt-1">{subtitle}</span>
            </div>
            <div className={`absolute -right-4 -bottom-4 w-24 h-24 blur-3xl opacity-0 group-hover:opacity-20 transition-opacity duration-500 bg-${color}-500`} />
        </div>
    );
}

function formatUptime(seconds: number) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h}H ${m}M ${s}S`;
}

export default App;
