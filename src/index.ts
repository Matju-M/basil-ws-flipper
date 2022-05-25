import forEach from 'lodash/forEach';
import filter from 'lodash/filter';
import head from 'lodash/head';
import { addPlugin, Flipper } from 'react-native-flipper';

declare var global: any;

let nativeSocket: any = global.window.WebSocket;
const sockets: WebSocket[] = [];
const currentSocketIds: string[] = [];

global.window.WebSocket = function (...args: any) {
    const socket: WebSocket = new nativeSocket(...args);

    const sendProxyHandler = {
        apply: (target: any, thisArg: any, argumentList: any) => {
            pluginSend('send', { key: socket.url, data: argumentList });
            return Reflect.apply(target, thisArg, argumentList);
        }
    }
    const sendProxy = new Proxy(socket.send, sendProxyHandler);

    socket.send = sendProxy;
    sockets.push(socket);
    return socket;
};

setInterval(() => {
    forEach(sockets, (socket) => {
        if (!currentSocketIds.includes(socket.url)) {
            pluginSend('add', { key: socket.url });
            currentSocketIds.push(socket.url);

            socket.addEventListener('open', (ev) => {
                pluginSend("open", { key: socket.url, data: ev })
            });
            socket.addEventListener('message', (ev) => {
                pluginSend("message", { key: socket.url, data: ev })
            });
            socket.addEventListener('close', (ev) => {
                pluginSend("close", { key: socket.url, data: ev })
            });
            socket.addEventListener('error', (ev) => {
                pluginSend("error", { key: socket.url, data: ev })
            });
        }
        pluginSend('status', { key: socket.url, data: socket.readyState });
    });


}, 1000, [sockets, pluginSend]);

let currentConnection: Flipper.FlipperConnection | null = null;


function pluginSend(method: string, data: Flipper.Serializable) {
    currentConnection?.send(method, data);
}

const createDebugger = () => {

    let event: Partial<MessageEvent> = {
        type: 'message',
        isTrusted: false
    };

    addPlugin({
        getId() {
            return 'flipper-plugin-basil-ws';
        },
        onConnect(connection) {
            console.log("basil-ws-flipper [CONNECTED]");
            currentConnection = connection;

            currentConnection?.receive('send', (state: any, responder: any) => {
                const { data, socketUrl } = state;
                const socket = head(filter(sockets, x => x.url === socketUrl));
                socket?.send(data);
            });

            currentConnection?.receive('mock', (state: any, responder: any) => {
                const { data, socketUrl } = state;
                const socket = head(filter(sockets, x => x.url === socketUrl));
                socket?.dispatchEvent({ type: 'message', data} as any);
            });
        }, 
        onDisconnect() {
            console.log("basil-ws-flipper [DISCONNECTED]");
            currentConnection = null;
        },
        runInBackground() {
            return true;
        }
    });
}

const wsDebugPlugin = createDebugger();
