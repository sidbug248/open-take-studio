import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './studio-theme.css';
import './stage.css';
import './inspection.css';

class StudioRecovery extends React.Component<React.PropsWithChildren, {error:Error|null;updated:boolean}> {
  state={error:null as Error|null,updated:false};
  static getDerivedStateFromError(error:Error){return {error,updated:/dynamically imported module|loading chunk|chunkloaderror|failed to fetch/i.test(error.message)};}
  onPreloadError=(event:Event)=>{event.preventDefault();this.setState({updated:true,error:new Error('The studio has a newer version available.')});};
  componentDidMount(){window.addEventListener('vite:preloadError',this.onPreloadError);}
  componentWillUnmount(){window.removeEventListener('vite:preloadError',this.onPreloadError);}
  render(){if(!this.state.error)return this.props.children;return <main className="studio-recovery" role="alert"><div><span className="eyebrow">OPEN TAKE STUDIO</span><h1>{this.state.updated?'The studio has updated.':'Let’s reopen your workspace.'}</h1><p>{this.state.updated?'This tab is using an earlier version. Reload to pick up the latest creative tools.':'A part of the interface could not open. Reload the studio to try again.'} Your saved projects, takes and running jobs remain on the server.</p><button className="btn primary" onClick={()=>window.location.reload()}>Reload your saved workspace</button><details><summary>Technical details</summary><pre>{this.state.error.message}</pre></details></div></main>;}
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><StudioRecovery><App /></StudioRecovery></React.StrictMode>);
