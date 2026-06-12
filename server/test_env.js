console.log('--- process.env keys ---');
console.log(Object.keys(process.env).filter(k => k.toLowerCase().includes('zc') || k.toLowerCase().includes('catalyst') || k.toLowerCase().includes('env') || k.toLowerCase().includes('user') || k.toLowerCase().includes('home')));
console.log('------------------------');
