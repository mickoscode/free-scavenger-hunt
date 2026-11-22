// CloudFront Function (viewer request) for the site's static files.
//   /e/<slug>/            -> /event/view/index.html      (the hunt's front page; the page reads the slug from the address)
//   /e/<slug>/play/       -> /event/play/index.html
//   /e/<slug>/results/    -> /event/results/index.html
//   /e/<slug>             -> redirect to /e/<slug>/
//   /admin  /admin/x      -> redirect to add the trailing slash; folders serve their index.html
// /api/* and /assets/* never reach this function. tests/unit/rewrite.test.js runs this very file.
function redirect(location) {
  return { statusCode: 301, statusDescription: 'Moved Permanently', headers: { location: { value: location } } };
}

function handler(event) {
  var request = event.request;
  var uri = request.uri;

  var hunt = /^\/e\/([a-z0-9-]{3,40})(\/(?:(play|results)\/)?)?$/.exec(uri);
  if (hunt) {
    if (hunt[2] === undefined) {
      var query = request.querystring ? Object.keys(request.querystring).map(function (k) { return k + '=' + request.querystring[k].value; }).join('&') : '';
      return redirect('/e/' + hunt[1] + '/' + (query ? '?' + query : ''));
    }
    request.uri = '/event/' + (hunt[3] || 'view') + '/index.html';
    return request;
  }
  var deeper = /^\/e\/([a-z0-9-]{3,40})\/(play|results)$/.exec(uri);
  if (deeper) return redirect('/e/' + deeper[1] + '/' + deeper[2] + '/');

  if (uri.charAt(uri.length - 1) === '/') {
    request.uri = uri + 'index.html';
  } else if (uri.lastIndexOf('.') < uri.lastIndexOf('/')) {
    return redirect(uri + '/');
  }
  return request;
}
